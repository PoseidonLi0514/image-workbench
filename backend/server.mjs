import fs from "node:fs/promises";
import fssync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1Client } from "./d1-client.mjs";
import { loadEnv } from "./runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv(path.resolve(__dirname, "..", ".env"));
loadEnv(path.resolve(__dirname, ".env"));

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3456);
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "https://imagebackend.78139191.xyz").replace(/\/+$/, "");
const ASSET_DIR = process.env.IMAGE_WORKBENCH_ASSET_DIR || path.resolve(__dirname, "..", "backend-data", "assets");
const ASSET_KEY_PREFIX = "image-workbench/jobs";
const JOB_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_EVENTS = 200;
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 10 * 60 * 1000);
const JOB_STREAM_PING_MS = Number(process.env.JOB_STREAM_PING_MS || 10 * 1000);
const activeJobs = new Map();
const d1 = new D1Client();
const SAFETY_CATEGORY_LABELS = new Map([
  ["harassment", "骚扰"],
  ["harassment/threatening", "威胁骚扰"],
  ["hate", "仇恨"],
  ["hate/threatening", "威胁仇恨"],
  ["illicit", "违法内容"],
  ["illicit/violent", "暴力违法"],
  ["self-harm", "自残"],
  ["self-harm/intent", "自残意图"],
  ["self-harm/instructions", "自残指导"],
  ["sexual", "性内容"],
  ["sexual/minors", "未成年人性内容"],
  ["violence", "暴力"],
  ["violence/graphic", "血腥暴力"],
]);
const SAFETY_CATEGORY_ALIASES = new Map([
  ["harassment-threatening", "harassment/threatening"],
  ["hate-threatening", "hate/threatening"],
  ["illicit-violent", "illicit/violent"],
  ["self-harm-intent", "self-harm/intent"],
  ["self-harm-instructions", "self-harm/instructions"],
  ["self/harm", "self-harm"],
  ["self/harm/intent", "self-harm/intent"],
  ["self/harm/instructions", "self-harm/instructions"],
  ["sexual-minors", "sexual/minors"],
  ["violence-graphic", "violence/graphic"],
]);
const SAFETY_CATEGORY_KEYS = [...SAFETY_CATEGORY_LABELS.keys()].sort((a, b) => b.length - a.length);

await fs.mkdir(ASSET_DIR, { recursive: true });

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) writeJson(response, { error: errorMessage(error) }, 500);
    else response.end();
  });
});

server.requestTimeout = 0;
server.headersTimeout = 65 * 1000;
server.keepAliveTimeout = 75 * 1000;
server.listen(PORT, HOST, () => {
  console.log(`image-workbench backend listening on http://${HOST}:${PORT}`);
});

async function handleRequest(request, response) {
  applyCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    const d1Health = await checkD1Health();
    writeJson(response, {
      ok: d1Health.ok,
      d1: d1Health.ok,
      d1Configured: d1.configured,
      d1Error: d1Health.error,
      publicBaseUrl: PUBLIC_BASE_URL,
    }, d1Health.ok ? 200 : 503);
    return;
  }
  if (url.pathname === "/api/jobs" && request.method === "POST") {
    await handleCreateJob(request, response, url);
    return;
  }
  if (url.pathname === "/api/jobs" && request.method === "GET") {
    await handleListJobs(response, url);
    return;
  }
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobMatch && request.method === "GET") {
    await handleGetJob(response, decodeURIComponent(jobMatch[1]));
    return;
  }
  if (jobMatch && request.method === "DELETE") {
    await handleDeleteJob(response, decodeURIComponent(jobMatch[1]));
    return;
  }
  if (url.pathname === "/api/assets" && request.method === "GET") {
    await handleAsset(response, url.searchParams.get("key") || "");
    return;
  }
  writeJson(response, { error: "Not found" }, 404);
}

async function handleCreateJob(request, response, url) {
  const payload = await readJsonBody(request);
  if (!payload || !payload.request) {
    writeJson(response, { error: "request is required" }, 400);
    return;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    sessionId: String(payload.sessionId || ""),
    status: "queued",
    statusLabel: "排队中",
    createdAt: now,
    updatedAt: now,
    outputText: "",
    response: null,
    error: "",
    events: [],
  };
  await putJob(job);

  if (shouldWaitForJob(url)) {
    streamJob(response, id, payload, job);
    return;
  }

  runJob(id, payload).catch((error) => failJob(id, error));
  writeJson(response, { id, status: job.status, statusLabel: job.statusLabel, createdAt: job.createdAt });
}

function streamJob(response, id, payload, initialJob) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  let current = initialJob;
  const send = (event, data) => {
    if (closed) return;
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const publish = (patch = {}) => {
    current = normalizeJob({ ...current, ...patch, updatedAt: new Date().toISOString() });
    send("job", current);
    return current;
  };
  const interval = setInterval(() => send("ping", { at: new Date().toISOString() }), JOB_STREAM_PING_MS);
  const cleanup = () => {
    closed = true;
    clearInterval(interval);
  };

  response.on("close", cleanup);
  send("job", current);

  runJob(id, payload, { publish })
    .then(async () => {
      const finalJob = await getJob(id).catch(() => null);
      if (finalJob && !closed) publish(finalJob);
    })
    .catch((error) => {
      if (!closed) publish({
        status: "failed",
        statusLabel: "请求失败",
        error: errorMessage(error),
      });
    })
    .finally(() => {
      cleanup();
      response.end();
    });
}

async function handleListJobs(response, url) {
  const sessionId = String(url.searchParams.get("sessionId") || "");
  const result = sessionId
    ? await d1.query(
      "SELECT id, session_id, status, status_label, created_at, updated_at FROM jobs WHERE session_id = ? ORDER BY updated_at DESC LIMIT 50",
      [sessionId],
    )
    : await d1.query(
      "SELECT id, session_id, status, status_label, created_at, updated_at FROM jobs ORDER BY updated_at DESC LIMIT 50",
    );
  writeJson(response, {
    jobs: (result.results || []).map((row) => ({
      id: row.id,
      sessionId: row.session_id || "",
      status: row.status,
      statusLabel: row.status_label,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

async function handleGetJob(response, id) {
  const job = await getJob(id);
  if (!job) {
    writeJson(response, { error: "Job not found" }, 404);
    return;
  }
  writeJson(response, job);
}

async function handleDeleteJob(response, id) {
  const active = activeJobs.get(id);
  if (active) active.controller.abort(new Error("任务已取消"));
  const job = await getJob(id);
  if (!job) {
    writeJson(response, { error: "Job not found" }, 404);
    return;
  }
  await patchJob(id, { status: "canceled", statusLabel: "已取消", error: "任务已取消" });
  writeJson(response, { ok: true, id, status: "canceled" });
}

async function handleAsset(response, key) {
  if (!key || !key.startsWith(`${ASSET_KEY_PREFIX}/`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const filePath = assetPathForKey(key);
  if (!filePath.startsWith(path.resolve(ASSET_DIR) + path.sep) || !fssync.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const ext = path.extname(filePath).slice(1);
  response.writeHead(200, {
    "Content-Type": mimeFromFormat(ext),
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  fssync.createReadStream(filePath).pipe(response);
}

async function checkD1Health() {
  if (!d1.configured) return { ok: false, error: "Missing D1 config." };
  try {
    await d1.query("SELECT 1 AS ok");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function runJob(id, payload, options = {}) {
  const publish = typeof options.publish === "function" ? options.publish : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`上游请求超过 ${Math.round(UPSTREAM_TIMEOUT_MS / 1000)} 秒未完成`)), UPSTREAM_TIMEOUT_MS);
  activeJobs.set(id, { controller });

  try {
    const apiKey = String(payload.apiKey || "").trim()
      || process.env.APIKEY
      || process.env.IMAGE_WORKBENCH_API_KEY
      || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await updateJob(id, publish, {
        status: "failed",
        statusLabel: "缺少后端 API Key",
        error: "Set APIKEY, IMAGE_WORKBENCH_API_KEY, or OPENAI_API_KEY.",
      });
      return;
    }

    const endpoint = resolveEndpoint(payload.endpoint);
    if (!endpoint) {
      await updateJob(id, publish, {
        status: "failed",
        statusLabel: "缺少后端 BASEURL",
        error: "Set BASEURL, IMAGE_WORKBENCH_BASE_URL, OPENAI_BASE_URL, or BASE_URL.",
      });
      return;
    }

    await updateJob(id, publish, { status: "running", statusLabel: "正在提交模型请求" });
    const requestBody = { ...payload.request };
    await appendEvent(id, `POST ${endpoint}`);

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": requestBody.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    await appendEvent(id, `HTTP ${upstream.status} ${upstream.statusText}`);
    if (!upstream.ok) {
      const text = await upstream.text();
      const error = new Error(text || `HTTP ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      error.upstreamStatusText = upstream.statusText;
      error.upstreamBody = text;
      throw error;
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (requestBody.stream && upstream.body && !contentType.includes("application/json")) {
      await updateJob(id, publish, { statusLabel: "等待生成完成" });
      const streamResult = await readSseResponse(id, upstream, publish);
      if (streamResult.failedResponse || streamResult.error) {
        const failure = classifyFailure(streamResult.error, streamResult.failedResponse);
        await updateJob(id, publish, {
          status: "failed",
          statusLabel: failure.statusLabel,
          response: streamResult.failedResponse,
          outputText: streamResult.outputText,
          error: failure.message,
        });
        return;
      }
      if (!streamResult.response && !streamResult.outputItems.length) {
        throw new Error("Stream ended without a completed response.");
      }
      const finalResponse = mergeStreamOutputItems(streamResult.response, streamResult.outputItems);
      const stored = await storeResponseAssets(id, finalResponse);
      if (!hasExpectedOutput(stored)) {
        await updateJob(id, publish, {
          status: "failed",
          statusLabel: "响应为空",
          response: stored,
          outputText: "",
          error: emptyResponseError(),
        });
        return;
      }
      await updateJob(id, publish, {
        status: "completed",
        statusLabel: "完成",
        response: stored,
        outputText: extractResponseText(stored) || streamResult.outputText,
        events: [{ at: new Date().toISOString(), line: `stream completed (${streamResult.eventCount} events)` }],
      });
    } else {
      await updateJob(id, publish, { statusLabel: "等待完整响应" });
      await appendEvent(id, "waiting for full response body");
      const data = await upstream.json();
      const stored = await storeResponseAssets(id, data);
      const responseFailure = classifyResponseFailure(stored);
      if (responseFailure) {
        await updateJob(id, publish, {
          status: "failed",
          statusLabel: responseFailure.statusLabel,
          response: stored,
          outputText: extractResponseText(stored),
          error: responseFailure.message,
        });
        return;
      }
      if (!hasExpectedOutput(stored)) {
        await updateJob(id, publish, {
          status: "failed",
          statusLabel: "响应为空",
          response: stored,
          outputText: "",
          error: emptyResponseError(),
        });
        return;
      }
      await updateJob(id, publish, {
        status: "completed",
        statusLabel: "完成",
        response: stored,
        outputText: extractResponseText(stored),
      });
    }
  } catch (error) {
    const failure = classifyFailure(error);
    await appendEvent(id, `error ${failure.statusLabel}: ${failure.message}`).catch(() => {});
    await updateJob(id, publish, {
      status: "failed",
      statusLabel: failure.statusLabel,
      error: failure.message,
    });
  } finally {
    clearTimeout(timeout);
    activeJobs.delete(id);
  }
}

async function readSseResponse(id, response, publish) {
  const decoder = new TextDecoder();
  let buffer = "";
  const state = {
    eventCount: 0,
    outputText: "",
    response: null,
    outputItems: [],
    seenItemIds: new Set(),
    statusFlags: {
      firstEvent: false,
      imageGenerating: false,
    },
    failedResponse: null,
    error: "",
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      await handleSseBlock(id, state, part, publish);
    }
  }
  if (buffer.trim()) await handleSseBlock(id, state, buffer, publish);
  return state;
}

async function handleSseBlock(id, state, block, publish) {
  let eventName = "";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  const text = dataLines.join("\n");
  if (text === "[DONE]") return;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    state.eventCount += 1;
    return;
  }

  const type = data.type || eventName || "event";
  state.eventCount += 1;
  if (!state.statusFlags.firstEvent) {
    state.statusFlags.firstEvent = true;
    await updateJob(id, publish, { statusLabel: "模型已开始响应" });
  }

  if (type === "response.output_text.delta" && data.delta) {
    state.outputText += data.delta;
  } else if (type === "response.output_text.done" && typeof data.text === "string") {
    state.outputText = data.text;
  } else if (type === "response.output_item.done" && data.item) {
    addStreamOutputItem(state, data.item);
  } else if (type === "response.image_generation_call.completed" && data.item) {
    addStreamOutputItem(state, data.item);
  } else if (type === "response.image_generation_call.completed" && data.result) {
    addStreamOutputItem(state, {
      id: data.item_id || data.output_item_id || `image-${state.outputItems.length + 1}`,
      type: "image_generation_call",
      result: data.result,
      output_format: data.output_format || "png",
      size: data.size || "",
      status: "completed",
    });
  } else if (type === "response.image_generation_call.partial_image" && !state.statusFlags.imageGenerating) {
    state.statusFlags.imageGenerating = true;
    await updateJob(id, publish, { statusLabel: "正在生成图片" });
  } else if (type === "response.completed" && data.response) {
    state.response = data.response;
  } else if (type === "response.failed" || type === "response.incomplete") {
    state.failedResponse = data.response || null;
    state.error = extractStreamError(data, type);
  } else if (data.error) {
    state.error = extractStreamError(data, type);
  }
}

function addStreamOutputItem(state, item) {
  if (!item || typeof item !== "object") return;
  if (item.type !== "image_generation_call" && item.type !== "message") return;
  const key = item.id || `${item.type}-${state.outputItems.length}`;
  if (state.seenItemIds.has(key) && !hasFinalImage(item)) return;
  if (!state.seenItemIds.has(key)) state.seenItemIds.add(key);
  if (hasFinalImage(item)) {
    state.outputItems = state.outputItems.filter((existing) => (existing && existing.id) !== key);
  }
  state.outputItems.push(item);
}

function hasFinalImage(item) {
  return item && item.type === "image_generation_call" && (item.result || item.result_url);
}

function mergeStreamOutputItems(response, outputItems) {
  const base = response && typeof response === "object" ? JSON.parse(JSON.stringify(response)) : { output: [] };
  const existing = Array.isArray(base.output) ? base.output : [];
  const seen = new Set(existing.map((item) => item && item.id).filter(Boolean));
  for (const item of outputItems || []) {
    if (!item || typeof item !== "object") continue;
    if (item.id && seen.has(item.id)) {
      const index = existing.findIndex((existingItem) => existingItem && existingItem.id === item.id);
      if (index !== -1 && hasFinalImage(item)) existing[index] = item;
      continue;
    }
    existing.push(item);
    if (item.id) seen.add(item.id);
  }
  base.output = existing;
  return base;
}

function extractStreamError(data, fallback) {
  if (!data || typeof data !== "object") return fallback;
  if (typeof data.error === "string") return data.error;
  if (data.error) return JSON.stringify(data.error);
  if (data.response && data.response.error) return JSON.stringify(data.response.error);
  return fallback;
}

function classifyResponseFailure(response) {
  if (!response || typeof response !== "object") return null;
  if (response.error) return classifyFailure(response.error, response);
  const status = String(response.status || "").toLowerCase();
  if (status === "failed" || status === "incomplete") {
    return classifyFailure({ code: status, message: `response.status=${status}` }, response);
  }
  return null;
}

function classifyFailure(error, response = null) {
  const normalized = normalizeFailure(error, response);
  const code = String(normalized.code || "").toLowerCase();
  const status = Number(normalized.upstreamStatus || 0);
  const message = normalized.message || errorMessage(error);
  const haystack = [code, normalized.type, normalized.status, message, normalized.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let statusLabel = "请求失败";
  if (isSafetyFailure(code, haystack)) {
    statusLabel = safetyStatusLabel(normalized);
  } else if (status === 401 || status === 403 || /unauthorized|authentication|invalid api key|incorrect api key|permission denied/.test(haystack)) {
    statusLabel = "上游鉴权失败";
  } else if (status === 429 || /rate.?limit|quota|insufficient_quota|too many requests/.test(haystack)) {
    statusLabel = "上游限流或额度不足";
  } else if (error && error.name === "AbortError" || /timeout|timed out|超过 .*秒|aborted/.test(haystack)) {
    statusLabel = "上游请求超时";
  } else if (status === 400 || /invalid_request|bad request|schema|parameter|unsupported|malformed/.test(haystack)) {
    statusLabel = "请求参数错误";
  } else if (status >= 500 || /server error|bad gateway|service unavailable|gateway timeout/.test(haystack)) {
    statusLabel = "上游服务错误";
  } else if (/response.status=incomplete|incomplete/.test(haystack)) {
    statusLabel = "模型响应未完成";
  } else if (/没有返回可显示|response ended without|empty/.test(haystack)) {
    statusLabel = "响应为空";
  }

  return {
    statusLabel,
    message: formatFailureMessage(statusLabel, normalized),
  };
}

function normalizeFailure(error, response) {
  const source = response && response.error ? response.error : error;
  const normalized = normalizeFailureSource(source);
  if (error && typeof error === "object") {
    if (error.upstreamStatus) normalized.upstreamStatus = error.upstreamStatus;
    if (error.upstreamStatusText) normalized.upstreamStatusText = error.upstreamStatusText;
    if (error.upstreamBody && !normalized.raw) normalized.raw = String(error.upstreamBody);
  }
  if (response && typeof response === "object" && response.status && !normalized.status) {
    normalized.status = String(response.status);
  }
  return normalized;
}

function normalizeFailureSource(source) {
  if (!source) return { message: "", raw: "" };
  if (typeof source === "object") {
    return {
      code: source.code || source.type || "",
      type: source.type || "",
      status: source.status || "",
      message: source.message || source.error || JSON.stringify(source),
      raw: JSON.stringify(source),
      structured: source,
    };
  }
  const raw = String(source);
  const parsed = parseJson(raw, null);
  if (parsed && typeof parsed === "object") return normalizeFailureSource(parsed);
  return { message: raw, raw };
}

function isSafetyFailure(code, haystack) {
  return code === "moderation_blocked"
    || /moderation_blocked|safety_violations|safety system|content_policy|policy violation/.test(haystack);
}

function safetyStatusLabel(failure) {
  const categories = extractSafetyCategories(failure);
  if (!categories.length) return "安全审核拦截";
  const labels = categories
    .map((category) => SAFETY_CATEGORY_LABELS.get(category))
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];
  return uniqueLabels.length ? `安全审核拦截：${uniqueLabels.join("、")}` : "安全审核拦截";
}

function extractSafetyCategories(failure) {
  const categories = new Set();
  collectSafetyCategories(failure.structured, categories);
  collectSafetyCategories(failure.raw, categories);
  collectSafetyCategories(failure.message, categories);
  collectSafetyCategories(failure.code, categories);
  return compactSafetyCategories(categories);
}

function compactSafetyCategories(categories) {
  const compacted = new Set(categories);
  for (const category of categories) {
    const parent = category.split("/")[0];
    if (parent !== category && compacted.has(parent)) compacted.delete(parent);
  }
  return [...compacted];
}

function collectSafetyCategories(value, categories) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectSafetyCategories(item, categories);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") {
        collectSafetyCategories(child, categories);
      } else if (isSafetyMetadataKey(key)) {
        collectSafetyCategories(child, categories);
      }
    }
    return;
  }
  addSafetyCategoriesFromText(String(value), categories);
}

function isSafetyMetadataKey(key) {
  return /safety|moderation|violation|category|categories|content_filter/.test(String(key || "").toLowerCase());
}

function addSafetyCategoriesFromText(text, categories) {
  const parsed = parseJson(text, null);
  if (parsed && typeof parsed === "object") {
    collectSafetyCategories(parsed, categories);
  }

  for (const match of text.matchAll(/(?:safety_violations|violations|categories)\s*[:=]\s*\[([^\]]+)\]/gi)) {
    for (const token of match[1].split(/[,，\s]+/)) {
      addNormalizedSafetyCategory(token, categories);
    }
  }

  for (const category of SAFETY_CATEGORY_KEYS) {
    const pattern = category
      .split(/[/-]/)
      .map(escapeRegExp)
      .join("[\\s_\\-./]+");
    const regex = new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i");
    if (regex.test(text)) categories.add(category);
  }
}

function addNormalizedSafetyCategory(value, categories) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[\[{(]+|[\]})]+$/g, "")
    .replace(/_/g, "-")
    .replace(/\./g, "/");
  const canonical = SAFETY_CATEGORY_ALIASES.get(normalized) || normalized;
  if (SAFETY_CATEGORY_LABELS.has(canonical)) categories.add(canonical);
}

function formatFailureMessage(statusLabel, failure) {
  const code = failure.code ? `（${failure.code}）` : "";
  let detail = failure.message || failure.raw || statusLabel;
  if (failure.upstreamStatus) {
    detail = `上游 HTTP ${failure.upstreamStatus}${failure.upstreamStatusText ? ` ${failure.upstreamStatusText}` : ""}: ${detail}`;
  }
  detail = String(detail).replace(/\s+/g, " ").trim();
  if (detail.length > 2000) detail = `${detail.slice(0, 2000)}...`;
  return `${statusLabel}${code}：${detail}`;
}

function extractResponseText(response) {
  if (!response || typeof response !== "object") return "";
  if (typeof response.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    if (item && item.type === "message") {
      for (const part of item.content || []) {
        if (part && typeof part.text === "string") chunks.push(part.text);
        else if (part && typeof part.output_text === "string") chunks.push(part.output_text);
      }
    }
  }
  return chunks.join("");
}

function hasVisibleOutput(response) {
  if (extractResponseText(response)) return true;
  return hasGeneratedImage(response);
}

function hasGeneratedImage(response) {
  for (const item of response && response.output || []) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "image_generation_call" && (item.result || item.result_url || item.result_asset_key)) return true;
  }
  return false;
}

function hasExpectedOutput(response) {
  return hasVisibleOutput(response);
}

function emptyResponseError() {
  return "模型完成了请求，但没有返回可显示的文本或图片。";
}

async function storeResponseAssets(jobId, response) {
  if (!response || typeof response !== "object") return response;
  const copy = JSON.parse(JSON.stringify(response));
  let imageIndex = 0;
  for (const item of copy.output || []) {
    if (!item || item.type !== "image_generation_call" || typeof item.result !== "string" || !item.result) continue;
    imageIndex += 1;
    const format = item.output_format || "png";
    const ext = extensionFromFormat(format);
    const key = `${ASSET_KEY_PREFIX}/${jobId}/${item.id || `image-${imageIndex}`}.${ext}`;
    const bytes = base64ToBytes(item.result);
    const filePath = assetPathForKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
    item.result_b64_removed = true;
    item.result_asset_key = key;
    item.result_url = `${PUBLIC_BASE_URL}/api/assets?key=${encodeURIComponent(key)}`;
    item.result = "";
  }
  return copy;
}

function assetPathForKey(key) {
  const relative = key.replace(new RegExp(`^${escapeRegExp(ASSET_KEY_PREFIX)}/`), "");
  return path.resolve(ASSET_DIR, relative);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function base64ToBytes(value) {
  return Buffer.from(value, "base64");
}

function mimeFromFormat(format) {
  const clean = String(format || "png").toLowerCase();
  if (clean === "jpg" || clean === "jpeg") return "image/jpeg";
  if (clean === "webp") return "image/webp";
  return "image/png";
}

function extensionFromFormat(format) {
  const clean = String(format || "png").toLowerCase();
  if (clean === "jpg" || clean === "jpeg") return "jpg";
  if (clean === "webp") return "webp";
  return "png";
}

async function getJob(id) {
  const result = await d1.query("SELECT * FROM jobs WHERE id = ? LIMIT 1", [id]);
  const row = result.results && result.results[0];
  return row ? rowToJob(row) : null;
}

async function putJob(job) {
  const normalized = normalizeJob(job);
  await d1.query(
    `INSERT INTO jobs (id, session_id, status, status_label, created_at, updated_at, output_text, response_json, error, events_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       status = excluded.status,
       status_label = excluded.status_label,
       updated_at = excluded.updated_at,
       output_text = excluded.output_text,
       response_json = excluded.response_json,
       error = excluded.error,
       events_json = excluded.events_json`,
    [
      normalized.id,
      normalized.sessionId,
      normalized.status,
      normalized.statusLabel,
      normalized.createdAt,
      normalized.updatedAt,
      normalized.outputText,
      normalized.response ? JSON.stringify(normalized.response) : null,
      normalized.error,
      JSON.stringify(normalized.events || []),
    ],
  );
}

async function patchJob(id, patch) {
  const current = await getJob(id);
  if (!current) return null;
  if (current.status === "canceled" && patch.status !== "canceled") return current;
  const next = normalizeJob({ ...current, ...patch, updatedAt: new Date().toISOString() });
  await putJob(next);
  return next;
}

async function updateJob(id, publish, patch) {
  const job = await patchJob(id, patch);
  if (job && publish) publish(job);
  return job;
}

async function appendEvent(id, line) {
  const current = await getJob(id);
  if (!current || current.status === "canceled") return;
  const events = [...(current.events || []), { at: new Date().toISOString(), line }].slice(-MAX_EVENTS);
  await patchJob(id, { events });
}

async function failJob(id, error) {
  await appendEvent(id, `error ${errorMessage(error)}`).catch(() => {});
  await patchJob(id, {
    status: "failed",
    statusLabel: "请求失败",
    error: errorMessage(error),
  });
}

function rowToJob(row) {
  return normalizeJob({
    id: row.id,
    sessionId: row.session_id || "",
    status: row.status,
    statusLabel: row.status_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    outputText: row.output_text || "",
    response: parseJson(row.response_json, null),
    error: row.error || "",
    events: parseJson(row.events_json, []),
  });
}

function normalizeJob(job) {
  return {
    id: String(job.id || ""),
    sessionId: String(job.sessionId || job.session_id || ""),
    status: String(job.status || "queued"),
    statusLabel: String(job.statusLabel || job.status_label || ""),
    createdAt: String(job.createdAt || job.created_at || new Date().toISOString()),
    updatedAt: String(job.updatedAt || job.updated_at || new Date().toISOString()),
    outputText: String(job.outputText || job.output_text || ""),
    response: job.response || null,
    error: String(job.error || ""),
    events: Array.isArray(job.events) ? job.events : [],
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function shouldWaitForJob(url) {
  const value = url.searchParams.get("wait");
  return value === "1" || value === "true";
}

function resolveEndpoint(payloadEndpoint) {
  return normalizeEndpoint(String(payloadEndpoint || "").trim()
    || process.env.BASEURL
    || process.env.IMAGE_WORKBENCH_BASE_URL
    || process.env.OPENAI_BASE_URL
    || process.env.BASE_URL
    || "");
}

function normalizeEndpoint(url) {
  const raw = String(url || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/responses$/.test(raw)) return raw;
  if (/\/v1$/.test(raw)) return `${raw}/responses`;
  return `${raw}/v1/responses`;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function errorMessage(error) {
  if (error && error.name === "AbortError") return "上游请求超时，模型接口没有在限定时间内返回完整结果。";
  if (error && error.message) return String(error.message);
  return String(error || "请求失败");
}
