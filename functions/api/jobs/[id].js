const JOB_TTL_SECONDS = 60 * 60 * 24 * 7;
const JOB_STALE_MS = 90 * 1000;

export async function onRequestGet(context) {
  const store = context.env && context.env.IMAGE_WORKBENCH_JOBS;
  if (!store) return json({ error: "Missing IMAGE_WORKBENCH_JOBS KV binding" }, 500);

  const job = await normalizeJobForRead(store, await store.get(`job:${context.params.id}`, "json"));
  if (!job) return json({ error: "Job not found" }, 404);
  return json(job);
}

export async function onRequestDelete(context) {
  const store = context.env && context.env.IMAGE_WORKBENCH_JOBS;
  if (!store) return json({ error: "Missing IMAGE_WORKBENCH_JOBS KV binding" }, 500);

  const job = await store.get(`job:${context.params.id}`, "json");
  if (!job) return json({ error: "Job not found" }, 404);
  job.status = "canceled";
  job.statusLabel = "已取消";
  job.updatedAt = new Date().toISOString();
  await store.put(`job:${job.id}`, JSON.stringify(job), { expirationTtl: JOB_TTL_SECONDS });
  return json({ ok: true, id: job.id, status: job.status });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function normalizeJobForRead(store, job) {
  if (!isStaleActiveJob(job)) return job;
  const failed = {
    ...job,
    status: "failed",
    statusLabel: "后台任务已中断",
    error: "后台任务长时间没有心跳，可能已被运行环境取消。请重新发送请求。",
    updatedAt: new Date().toISOString(),
  };
  await store.put(`job:${job.id}`, JSON.stringify(failed), { expirationTtl: JOB_TTL_SECONDS });
  return failed;
}

function isStaleActiveJob(job) {
  if (!job || (job.status !== "queued" && job.status !== "running")) return false;
  const updatedAt = Date.parse(job.updatedAt || job.createdAt || "");
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > JOB_STALE_MS;
}
