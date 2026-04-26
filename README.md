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

5. Set a backend API key in Cloudflare:

   ```bash
   npx wrangler pages secret put IMAGE_WORKBENCH_API_KEY --project-name image-workbench
   ```

   `OPENAI_API_KEY` also works as a fallback variable name.

6. Run locally through Pages Functions:

   ```bash
   npm run dev
   ```

7. Deploy:

   ```bash
   npm run deploy
   ```

When the UI's `后端任务模式` checkbox is enabled, requests are submitted to `/api/jobs`. The backend stores task status and lightweight response metadata in KV, so refreshing the page can recover the latest active job for the current session.

Generated image base64 payloads are extracted from the model response and stored in R2 under `image-workbench/jobs/...`. KV keeps only R2 keys and `/api/assets?key=...` URLs for those images.
