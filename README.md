# Image Workbench

Single-page image generation/editing workbench. The frontend is a static Cloudflare Pages site, and all long-running image jobs are handled by a long-lived Node.js backend on GCP.

## Runtime Architecture

```text
Browser SPA
  |-- loads static assets from Cloudflare Pages project: image-workbench
  |-- stores user UI data locally in the browser
  |
  `-- calls https://imagebackend.78139191.xyz
        |
        |-- Node.js backend, PM2 process: image-workbench-backend
        |-- reverse proxy -> 127.0.0.1:3456 on the GCP host
        |
        |-- calls the configured model API for image generation/editing
        |-- calls Cloudflare D1 through the Cloudflare REST API
        `-- stores generated image assets on local GCP disk
```

Important boundaries:

- Cloudflare Pages is static-only. Do not put long-running image jobs back into Pages Functions.
- D1 stores job state and response metadata. It is accessed from Node.js through the Cloudflare API token, not through a Workers binding.
- Generated image files are stored by the Node backend on local disk under `backend-data/assets/`.
- Browser sessions, turns, prompt favorites, user settings, gallery copies, and saved reference images are local browser data.
- R2 and KV are not used by this app anymore. Do not clean or modify the `lobechat` R2 bucket for image-workbench work.

## Frontend

Install dependencies:

```bash
npm install
```

Run the Pages frontend locally:

```bash
npm run dev
```

Build static assets:

```bash
npm run build
```

Deploy the frontend:

```bash
npm run deploy
```

`npm run build` runs `scripts/build-static.mjs`, which creates `dist/` and copies only:

- `index.html`
- `404.html`
- `app.js`
- `styles.css`
- `assets/`

Cloudflare Pages configuration is in `wrangler.toml`:

```toml
name = "image-workbench"
compatibility_date = "2026-04-26"
pages_build_output_dir = "dist"
```

The frontend backend URL is hardcoded in `app.js`:

- `localhost` / `127.0.0.1`: `http://127.0.0.1:3456`
- production: `https://imagebackend.78139191.xyz`

If API URL and API Key are left blank in the browser, the Node backend uses server-side environment defaults. Browser-filled values override those defaults for that request.

## Node Backend

Backend entry:

```bash
backend/server.mjs
```

PM2 config:

```bash
ecosystem.config.cjs
```

The production PM2 process is named:

```text
image-workbench-backend
```

The backend listens on `127.0.0.1:3456`. The server reverse proxy should terminate SSL and forward:

```text
https://imagebackend.78139191.xyz -> 127.0.0.1:3456
```

Run directly:

```bash
npm run backend
```

Run or restart under PM2:

```bash
npm run backend:pm2:start
npm run backend:pm2:restart
```

Production health check:

```bash
curl -sS https://imagebackend.78139191.xyz/health
```

Production PM2 check on the GCP host:

```bash
ssh gcp 'pm2 status image-workbench-backend --no-color'
```

## Environment

Create `backend/.env` from `backend/.env.example`.

Required runtime variables:

```bash
HOST=127.0.0.1
PORT=3456
PUBLIC_BASE_URL=https://imagebackend.78139191.xyz

BASEURL=...
APIKEY=...

CF_ACCOUNT_ID=...
CF_API_TOKEN=...
D1_DATABASE_ID=...
```

Accepted aliases for the model API base URL:

- `BASEURL`
- `IMAGE_WORKBENCH_BASE_URL`
- `OPENAI_BASE_URL`
- `BASE_URL`

Accepted aliases for the model API key:

- `APIKEY`
- `IMAGE_WORKBENCH_API_KEY`
- `OPENAI_API_KEY`

Accepted aliases for Cloudflare credentials:

- `CF_ACCOUNT_ID` or `CLOUDFLARE_ACCOUNT_ID`
- `CF_API_TOKEN` or `CLOUDFLARE_API_TOKEN`
- `D1_DATABASE_ID` or `IMAGE_WORKBENCH_D1_DATABASE_ID`

Optional variables:

```bash
CORS_ORIGIN=*
IMAGE_WORKBENCH_ASSET_DIR=
UPSTREAM_TIMEOUT_MS=600000
JOB_STREAM_PING_MS=10000
NAMING_TIMEOUT_MS=45000
```

## D1

Schema:

```bash
backend/schema.sql
```

Create a database:

```bash
npx wrangler d1 create image_workbench_jobs
```

Run migrations:

```bash
npm run backend:migrate
```

The backend uses `backend/d1-client.mjs` to call the Cloudflare D1 REST API. The main table is `jobs`.

`jobs` stores:

- job id and session id
- status and status label
- created/updated timestamps
- output text
- full response JSON after generated image base64 is replaced by backend asset URLs
- error text
- job event log JSON

Useful indexes are created for updated time, status, and session id.

## Backend API

Health:

```http
GET /health
```

Jobs:

```http
POST /api/jobs?wait=1
GET /api/jobs
GET /api/jobs?sessionId=...
GET /api/jobs/:id
DELETE /api/jobs/:id
```

Assets:

```http
GET /api/assets?key=...
```

AI naming:

```http
POST /api/name
```

`POST /api/jobs?wait=1` uses Server-Sent Events. The backend sends an initial job event and periodic `ping` events while waiting for the upstream model API, so the browser is not sitting on a totally silent response.

`DELETE /api/jobs/:id` cancels an active in-memory job when it is still running and marks the D1 job as canceled.

## Request Flow

1. The browser creates a job with `POST /api/jobs?wait=1`.
2. The backend creates a queued row in D1.
3. In wait mode, the backend keeps an SSE connection open and publishes job state updates.
4. The backend calls the configured upstream model API.
5. When the model returns, the backend extracts generated image base64 payloads.
6. Extracted images are written to `backend-data/assets/`.
7. D1 is updated with final status, events, errors, output text, and normalized response JSON.
8. The browser receives the final job payload and stores its own local session/gallery state.

The backend default upstream timeout is 10 minutes (`UPSTREAM_TIMEOUT_MS=600000`). The SSE ping interval defaults to 10 seconds (`JOB_STREAM_PING_MS=10000`).

## Browser Data

The browser stores user-facing app state locally. This includes:

- sessions and turns
- active session id
- sidebar collapsed state
- settings
- prompt favorites
- gallery items
- saved user-uploaded reference images

The generated gallery shown in the browser uses local IndexedDB copies. User-uploaded reference images are also browser-local when saved. They are not uploaded to R2, and they are not included in the generated image gallery.

Deleting a session does not delete generated images from the browser gallery or backend asset storage.

## Generated Assets

Generated images are persisted by the Node backend under:

```text
backend-data/assets/
```

The backend returns public asset URLs using:

```text
PUBLIC_BASE_URL/api/assets?key=...
```

The asset key prefix used by the backend is:

```text
image-workbench/jobs
```

Keep this storage in mind when moving the backend to a new host. D1 contains job metadata, but the actual generated image files live on the backend server disk unless `IMAGE_WORKBENCH_ASSET_DIR` points somewhere else.

## Prompt Behavior

The current default system prompt is the strict "preserve prompt as-is" instruction. It tells the model/tool layer to pass the user's image prompt through without rewriting, translating, summarizing, expanding, correcting, or adding style words.

The frontend also appends the same preserve-prompt instruction when a custom system prompt does not already contain it. This keeps legacy settings from silently returning to the older "professional image generation assistant" behavior.

## Safety Errors

The backend classifies safety/moderation failures into user-readable labels. Known categories include:

- `harassment`
- `hate`
- `illicit`
- `self-harm`
- `sexual`
- `sexual/minors`
- `violence`
- slash variants such as `violence/graphic`

For example, a sexual-content block is surfaced as:

```text
安全审核拦截：性内容
```

Non-safety upstream errors are handled as normal request failures.

## Deployment Notes

Frontend deploy:

```bash
npm run deploy
```

Backend deploy is intentionally separate from Cloudflare Pages. Update the code on the GCP host, then restart PM2 from the backend project directory:

```bash
ssh gcp 'cd /home/ubuntu/image-workbench && node --check backend/server.mjs && pm2 restart image-workbench-backend --update-env'
```

Check backend health after restart:

```bash
curl -sS https://imagebackend.78139191.xyz/health
```

Check PM2 logs if requests fail:

```bash
ssh gcp 'pm2 logs image-workbench-backend --lines 120 --nostream'
```

Docs-only changes do not require a Pages deploy or backend restart.

## Notes For Future Developers

- Keep the frontend static. Long image generations should go through the Node backend.
- Avoid reintroducing Cloudflare KV as the job queue unless there is a clear reason. D1 is the source of truth for backend job state.
- Avoid reintroducing R2 for image-workbench unless the asset storage strategy is deliberately changed. Never delete unrelated R2 data, especially `lobechat`.
- `/api/name` is used for session and prompt favorite naming. It uses a chat-completions style request for compatibility with the configured model gateway.
- When changing backend URLs, update `app.js` and make sure the reverse proxy and `PUBLIC_BASE_URL` stay aligned.
