import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1Client } from "./d1-client.mjs";
import { loadEnv } from "./runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv(path.resolve(__dirname, "..", ".env"));
loadEnv(path.resolve(__dirname, ".env"));

const schemaPath = path.join(__dirname, "schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");
const statements = schema
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter((statement) => !statement.includes("idx_jobs_session_updated_at"));

const d1 = new D1Client();
for (const statement of statements) {
  await d1.query(statement);
  console.log(`ok: ${statement.split(/\s+/).slice(0, 6).join(" ")}`);
}
const columns = await d1.query("PRAGMA table_info(jobs)");
const columnNames = new Set((columns.results || []).map((row) => row.name));
if (!columnNames.has("session_id")) {
  await d1.query("ALTER TABLE jobs ADD COLUMN session_id TEXT NOT NULL DEFAULT ''");
  console.log("ok: ALTER TABLE jobs ADD COLUMN session_id");
}
await d1.query("CREATE INDEX IF NOT EXISTS idx_jobs_session_updated_at ON jobs(session_id, updated_at DESC)");
console.log("ok: CREATE INDEX IF NOT EXISTS idx_jobs_session_updated_at");
console.log("D1 migration complete");
