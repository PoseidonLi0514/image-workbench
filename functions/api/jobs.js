const JOB_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_EVENTS = 200;
const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000;
const R2_PREFIX = "image-workbench/jobs";

export async function onRequestPost(context) {
  const store = getJobStore(context.env);
  if (!store) return json({ error: "Missing IMAGE_WORKBENCH_JOBS KV binding" }, 500);

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!payload || !payload.request) {
    return json({ error: "request is required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    status: "queued",
    statusLabel: "排队中",
    createdAt: now,
    updatedAt: now,
    outputText: "",
    response: null,
    error: "",
    events: [],
  };

  await putJob(store, job);
  context.waitUntil(runJob(store, context.env, id, payload));
  return json({ id, status: job.status, statusLabel: job.statusLabel, createdAt: job.createdAt });
}

export async function onRequestGet(context) {
  const store = getJobStore(context.env);
  if (!store) return json({ error: "Missing IMAGE_WORKBENCH_JOBS KV binding" }, 500);

  const list = await store.list({ prefix: "job:", limit: 50 });
  const jobs = [];
  for (const key of list.keys) {
    const job = await getJob(store, key.name.slice(4));
    if (job) {
      jobs.push({
        id: job.id,
        status: job.status,
        statusLabel: job.statusLabel,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }
  }
  jobs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return json({ jobs });
}

async function runJob(store, env, id, payload) {
  const apiKey = String(payload.apiKey || "").trim()
    || env.APIKEY
    || env.IMAGE_WORKBENCH_API_KEY
    || env.OPENAI_API_KEY;
  if (!apiKey) {
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "缺少后端 API Key",
      error: "Set APIKEY, IMAGE_WORKBENCH_API_KEY, or OPENAI_API_KEY in Cloudflare environment variables.",
    });
    return;
  }

  const endpoint = resolveEndpoint(env, payload.endpoint);
  if (!endpoint) {
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "缺少后端 BASEURL",
      error: "Set BASEURL, IMAGE_WORKBENCH_BASE_URL, OPENAI_BASE_URL, or BASE_URL in Cloudflare environment variables.",
    });
    return;
  }

  const upstreamTimeout = createTimeout(UPSTREAM_TIMEOUT_MS);
  try {
    await patchJob(store, id, { status: "running", statusLabel: "正在提交模型请求" });
    const requestBody = { ...payload.request };
    await appendEvent(store, id, `POST ${endpoint}`);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": requestBody.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: upstreamTimeout.signal,
    });

    await appendEvent(store, id, `HTTP ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (requestBody.stream && response.body && !contentType.includes("application/json")) {
      await patchJob(store, id, { statusLabel: "等待生成完成" });
      const streamResult = await readSseResponse(store, env, id, response);
      if (streamResult.failedResponse || streamResult.error) {
        await patchJob(store, id, {
          status: "failed",
          statusLabel: "请求失败",
          response: streamResult.failedResponse,
          outputText: streamResult.outputText,
          error: streamResult.error || "Stream failed",
        });
        return;
      }
      if (!streamResult.response && !streamResult.outputItems.length) {
        throw new Error("Stream ended without a completed response.");
      }
      const finalResponse = mergeStreamOutputItems(streamResult.response, streamResult.outputItems);
      const stored = await storeResponseAssets(env, id, finalResponse);
      if (!hasExpectedOutput(requestBody, stored)) {
        await patchJob(store, id, {
          status: "failed",
          statusLabel: "响应为空",
          response: stored,
          outputText: "",
          error: emptyResponseError(requestBody),
        });
        return;
      }
      await patchJob(store, id, {
        status: "completed",
        statusLabel: "完成",
        response: stored,
        outputText: extractResponseText(stored) || streamResult.outputText,
        events: [{ at: new Date().toISOString(), line: `stream completed (${streamResult.eventCount} events)` }],
      });
    } else {
      await patchJob(store, id, { statusLabel: "等待完整响应" });
      await appendEvent(store, id, "waiting for full response body");
      const data = await response.json();
      const stored = await storeResponseAssets(env, id, data);
      if (!hasExpectedOutput(requestBody, stored)) {
        await patchJob(store, id, {
          status: "failed",
          statusLabel: "响应为空",
          response: stored,
          outputText: "",
          error: emptyResponseError(requestBody),
        });
        return;
      }
      await patchJob(store, id, {
        status: "completed",
        statusLabel: "完成",
        response: stored,
        outputText: extractResponseText(stored),
      });
    }
  } catch (error) {
    await appendEvent(store, id, `error ${errorMessage(error)}`);
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "请求失败",
      error: errorMessage(error),
    });
  } finally {
    upstreamTimeout.cancel();
  }
}

function createTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`上游请求超过 ${Math.round(ms / 1000)} 秒未完成`));
  }, ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function errorMessage(error) {
  if (error && error.name === "AbortError") return "上游请求超时，模型接口没有在限定时间内返回完整结果。";
  if (error && error.message) return String(error.message);
  return String(error || "请求失败");
}

function resolveEndpoint(env, payloadEndpoint) {
  return normalizeEndpoint(String(payloadEndpoint || "").trim()
    || env.BASEURL
    || env.IMAGE_WORKBENCH_BASE_URL
    || env.OPENAI_BASE_URL
    || env.BASE_URL
    || "");
}

function normalizeEndpoint(url) {
  const raw = String(url || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/responses$/.test(raw)) return raw;
  if (/\/v1$/.test(raw)) return `${raw}/responses`;
  return `${raw}/v1/responses`;
}

async function readSseResponse(store, env, id, response) {
  const reader = response.body.getReader();
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      await handleSseBlock(store, env, id, state, part);
    }
  }
  if (buffer.trim()) await handleSseBlock(store, env, id, state, buffer);
  return state;
}

async function handleSseBlock(store, env, id, state, block) {
  let eventName = "";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  const text = dataLines.join("\n");
  if (text === "[DONE]") {
    return;
  }

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
    await patchJob(store, id, { statusLabel: "模型已开始响应" });
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
    await patchJob(store, id, { statusLabel: "正在生成图片" });
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
  if (state.seenItemIds.has(key)) return;
  state.seenItemIds.add(key);
  state.outputItems.push(item);
}

function mergeStreamOutputItems(response, outputItems) {
  const base = response && typeof response === "object" ? JSON.parse(JSON.stringify(response)) : { output: [] };
  const existing = Array.isArray(base.output) ? base.output : [];
  const seen = new Set(existing.map((item) => item && item.id).filter(Boolean));
  for (const item of outputItems || []) {
    if (!item || typeof item !== "object") continue;
    if (item.id && seen.has(item.id)) continue;
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
    if (item.type === "image_generation_call" && (item.result || item.result_url || item.result_r2_key)) return true;
  }
  return false;
}

function hasExpectedOutput(requestBody, response) {
  if (expectsImageGeneration(requestBody)) return hasGeneratedImage(response);
  return hasVisibleOutput(response);
}

function expectsImageGeneration(requestBody) {
  return Array.isArray(requestBody && requestBody.tools)
    && requestBody.tools.some((tool) => tool && tool.type === "image_generation");
}

function emptyResponseError(requestBody) {
  return expectsImageGeneration(requestBody)
    ? "模型完成了请求，但没有返回图片。"
    : "模型完成了请求，但没有返回可显示的文本或图片。";
}

async function storeResponseAssets(env, jobId, response) {
  if (!response || typeof response !== "object") return response;
  const bucket = env && env.IMAGE_WORKBENCH_R2;
  if (!bucket) return stripInlineImageResults(response);

  const copy = JSON.parse(JSON.stringify(response));
  let imageIndex = 0;
  for (const item of copy.output || []) {
    if (!item || item.type !== "image_generation_call" || typeof item.result !== "string" || !item.result) continue;
    imageIndex += 1;
    const format = item.output_format || "png";
    const mime = mimeFromFormat(format);
    const ext = extensionFromFormat(format);
    const key = `${R2_PREFIX}/${jobId}/${item.id || `image-${imageIndex}`}.${ext}`;
    const bytes = base64ToBytes(item.result);
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: {
        jobId,
        outputItemId: String(item.id || ""),
        prompt: String(item.revised_prompt || "").slice(0, 1024),
      },
    });
    item.result_b64_removed = true;
    item.result_r2_key = key;
    item.result_url = `/api/assets?key=${encodeURIComponent(key)}`;
    item.result = "";
  }
  return copy;
}

function stripInlineImageResults(response) {
  const copy = JSON.parse(JSON.stringify(response));
  for (const item of copy.output || []) {
    if (item && item.type === "image_generation_call" && typeof item.result === "string" && item.result) {
      item.result_b64_removed = true;
      item.result = "";
    }
  }
  return copy;
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

function getJobStore(env) {
  return env && env.IMAGE_WORKBENCH_JOBS;
}

async function getJob(store, id) {
  return store.get(`job:${id}`, "json");
}

async function putJob(store, job) {
  job.updatedAt = new Date().toISOString();
  await store.put(`job:${job.id}`, JSON.stringify(job), { expirationTtl: JOB_TTL_SECONDS });
}

async function patchJob(store, id, patch) {
  const current = await getJob(store, id);
  if (!current) return;
  if (current.status === "canceled" && patch.status !== "canceled") return;
  await putJob(store, { ...current, ...patch });
}

async function appendEvent(store, id, line) {
  const current = await getJob(store, id);
  if (!current) return;
  if (current.status === "canceled") return;
  const events = [...(current.events || []), { at: new Date().toISOString(), line }].slice(-MAX_EVENTS);
  await putJob(store, { ...current, events });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
