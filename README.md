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

4. Set a backend API key in Cloudflare:

   ```bash
   npx wrangler pages secret put IMAGE_WORKBENCH_API_KEY --project-name image-workbench
   ```

   `OPENAI_API_KEY` also works as a fallback variable name.

5. Run locally through Pages Functions:

   ```bash
   npm run dev
   ```

6. Deploy:

   ```bash
   npm run deploy
   ```

When the UI's `后端任务模式` checkbox is enabled, requests are submitted to `/api/jobs`. The backend stores task status in KV, so refreshing the page can recover the latest active job for the current session.

Current backend storage uses KV for the job record and final response. If very large image responses exceed KV limits, move response/image blobs to R2 and keep only metadata in KV.
