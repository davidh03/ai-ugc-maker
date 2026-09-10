import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Merges server/.env into process.env, without overriding anything already
// set by the real environment (Docker/systemd/shell). Runs as an import-time
// side effect from config.js — every other module reads secrets through
// config.js or via process.env defaults evaluated at call time, so as long
// as this runs before config.js's top-level `export const config` is built,
// import order elsewhere doesn't matter.
export function loadDotEnv() {
  let lines;
  try { lines = readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n'); }
  catch { return; }
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
