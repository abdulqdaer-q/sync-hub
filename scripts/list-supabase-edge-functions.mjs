#!/usr/bin/env node
/**
 * Print deployable Supabase Edge Function folder names (one per line).
 * Skips _shared and non-directories.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsDir = path.join(repoRoot, "supabase", "functions");

if (!fs.existsSync(functionsDir)) {
  process.exit(0);
}

const names = fs
  .readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name)
  .sort();

for (const name of names) {
  const indexPath = path.join(functionsDir, name, "index.ts");
  if (fs.existsSync(indexPath)) {
    process.stdout.write(`${name}\n`);
  }
}
