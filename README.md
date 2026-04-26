# Image Workbench

Single-page image generation/editing workbench with an optional Cloudflare Pages Functions backend.

## Static Mode

Open `index.html` directly in a browser. Requests are sent from the browser to the configured API URL.

## Cloudflare Backend Mode

Deploy to Cloudflare Pages to enable backend jobs:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create KV namespaces:

   ```bash
   npx wrangler kv namespace create IMAGE_WORKBENCH_JOBS
   npx wrangler kv namespace create IMAGE_WORKBENCH_JOBS --preview
   ```

3. Replace the placeholder IDs in `wrangler.toml`.

4. Bind an R2 bucket in `wrangler.toml`.

   This repo currently uses the existing `lobechat` bucket:

   ```toml
   [[r2_buckets]]
   binding = "IMAGE_WORKBENCH_R2"
   bucket_name = "lobechat"
   preview_bucket_name = "lobechat"
   ```

5. Set backend API environment variables in Cloudflare:

   ```bash
   npx wrangler pages secret put APIKEY --project-name image-workbench
   npx wrangler pages secret put BASEURL --project-name image-workbench
   ```

   `IMAGE_WORKBENCH_API_KEY` or `OPENAI_API_KEY` also work as fallback key variable names.
   `IMAGE_WORKBENCH_BASE_URL`, `OPENAI_BASE_URL`, or `BASE_URL` also work as fallback base URL variable names.

6. Run locally through Pages Functions:

   ```bash
   npm run dev
   ```

7. Deploy:

   ```bash
   npm run deploy
   ```

The UI defaults to backend mode. If API URL and API Key are left blank, requests use the server-provided `BASEURL` and `APIKEY`. If either field is filled in the browser, that value overrides the server variable for that request and is saved in the current browser by default.

When the UI's `后端任务模式` checkbox is enabled in settings, requests are submitted to `/api/jobs?wait=1`. The Pages Function keeps that request open until the model request finishes, stores task status and lightweight response metadata in KV, and returns the completed job to the browser. The plain `/api/jobs` endpoint is still available for compatibility, but long image generations should not rely on detached `waitUntil()` background work.

Generated image base64 payloads are extracted from the model response and stored in R2 under `image-workbench/jobs/...`. KV keeps only R2 keys and `/api/assets?key=...` URLs for those images.
