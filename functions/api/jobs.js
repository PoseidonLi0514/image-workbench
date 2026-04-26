const JOB_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_EVENTS = 200;
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

  if (!payload || !payload.endpoint || !payload.request) {
    return json({ error: "endpoint and request are required" }, 400);
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
  const apiKey = env.IMAGE_WORKBENCH_API_KEY || env.OPENAI_API_KEY || payload.apiKey;
  if (!apiKey) {
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "缺少后端 API Key",
      error: "Set IMAGE_WORKBENCH_API_KEY or OPENAI_API_KEY in Cloudflare environment variables.",
    });
    return;
  }

  try {
    await patchJob(store, id, { status: "running", statusLabel: "正在提交模型请求" });
    const requestBody = payload.request;
    const response = await fetch(payload.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Accept": requestBody.stream ? "text/event-stream, application/json" : "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    await appendEvent(store, id, `HTTP ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (requestBody.stream && response.body && !contentType.includes("application/json")) {
      await readSse(store, env, id, response);
    } else {
      await patchJob(store, id, { statusLabel: "等待完整响应" });
      const data = await response.json();
      const stored = await storeResponseAssets(env, id, data);
      await patchJob(store, id, {
        status: "completed",
        statusLabel: "完成",
        response: stored,
        outputText: extractResponseText(stored),
      });
    }
  } catch (error) {
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "请求失败",
      error: String(error && (error.stack || error.message) || error),
    });
  }
}

async function readSse(store, env, id, response) {
  await patchJob(store, id, { statusLabel: "正在接收事件流" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      await handleSseBlock(store, env, id, part);
    }
  }
  if (buffer.trim()) await handleSseBlock(store, env, id, buffer);
}

async function handleSseBlock(store, env, id, block) {
  let eventName = "";
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  const text = dataLines.join("\n");
  if (text === "[DONE]") {
    await appendEvent(store, id, "done");
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    await appendEvent(store, id, `${eventName || "event"} ${text.slice(0, 500)}`);
    return;
  }

  const type = data.type || eventName || "event";
  await appendEvent(store, id, type);

  if (type === "response.output_text.delta" && data.delta) {
    const job = await getJob(store, id);
    await patchJob(store, id, {
      outputText: `${job && job.outputText || ""}${data.delta}`,
      statusLabel: "正在生成文本",
    });
  } else if (type === "response.output_text.done" && typeof data.text === "string") {
    await patchJob(store, id, { outputText: data.text, statusLabel: "文本已生成" });
  } else if (type === "response.image_generation_call.partial_image") {
    await patchJob(store, id, { statusLabel: "正在生成图片" });
  } else if (type === "response.completed" && data.response) {
    const stored = await storeResponseAssets(env, id, data.response);
    await patchJob(store, id, {
      status: "completed",
      statusLabel: "完成",
      response: stored,
      outputText: extractResponseText(stored),
    });
  } else if ((type === "response.failed" || type === "response.incomplete") && data.response) {
    await patchJob(store, id, {
      status: "failed",
      statusLabel: "请求失败",
      response: data.response,
      error: data.response.error ? JSON.stringify(data.response.error) : type,
    });
  }
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
