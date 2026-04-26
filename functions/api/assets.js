export async function onRequestGet(context) {
  const bucket = context.env && context.env.IMAGE_WORKBENCH_R2;
  if (!bucket) return new Response("Missing IMAGE_WORKBENCH_R2 binding", { status: 500 });

  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  if (!key || !key.startsWith("image-workbench/jobs/")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
