import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

for (const file of ["index.html", "404.html", "app.js", "styles.css"]) {
  await fs.copyFile(path.join(root, file), path.join(dist, file));
}

await fs.cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
