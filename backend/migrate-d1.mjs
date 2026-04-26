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
  .filter(Boolean);

const d1 = new D1Client();
for (const statement of statements) {
  await d1.query(statement);
  console.log(`ok: ${statement.split(/\s+/).slice(0, 6).join(" ")}`);
}
console.log("D1 migration complete");
