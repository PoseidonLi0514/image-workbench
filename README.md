# Image Workbench

Single-page image generation/editing workbench. The frontend is hosted by Cloudflare Pages, while backend job execution runs on a long-lived Node.js service.

## Frontend

Install dependencies:

```bash
npm install
```

Run the Pages frontend locally:

```bash
npm run dev
```

Deploy the frontend:

```bash
npm run deploy
```

The UI defaults to `后端任务模式`. In production it sends backend job requests directly to the Node backend:

```text
https://imagebackend.78139191.xyz
```

When opened from `localhost` or `127.0.0.1`, it uses:

```text
http://127.0.0.1:3456
```

If API URL and API Key are left blank in the browser, the Node backend uses its server-side `BASEURL` and `APIKEY` environment variables. Browser-filled values override those server defaults for that request.

## Node Backend

The backend listens on `127.0.0.1:3456`; your reverse proxy should terminate SSL and forward `https://imagebackend.78139191.xyz` to that local port.

Create `backend/.env` from `backend/.env.example` and set:

```bash
HOST=127.0.0.1
PORT=3456
PUBLIC_BASE_URL=https://imagebackend.78139191.xyz
BASEURL=https://api.xn--6iqtf2zx5kzwsi0c2u8b8sj.cn
APIKEY=...
CF_ACCOUNT_ID=...
CF_API_TOKEN=...
D1_DATABASE_ID=...
```

Create a D1 database and run the schema:

```bash
npx wrangler d1 create image_workbench_jobs
npm run backend:migrate
```

Run directly:

```bash
npm run backend
```

Run under pm2:

```bash
npm run backend:pm2:start
```

Generated image base64 payloads are extracted from model responses and stored on local disk under `backend-data/assets/`. D1 stores job state, errors, events, and response metadata with image URLs pointing back to the Node backend.

Cloudflare Pages is static-only for this app. The old Pages Functions, KV job queue, and R2 image storage path have been removed; the `lobechat` R2 bucket is not used by image-workbench.
