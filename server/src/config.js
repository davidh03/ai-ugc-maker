import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must run before the object below reads process.env — every module that
// imports `config` (directly or transitively, and many do, before index.js
// gets a chance to run its own startup code) needs .env already merged in.
loadDotEnv();

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  composer: process.env.COMPOSER || 'template',
  agentCmd: process.env.AGENT_CMD || '',
  maxDurationSec: Number(process.env.MAX_DURATION_SEC || 180),
  wordsPerMinute: 150,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Bearer token gating /api/*. Empty = unauthenticated (local dev only) —
  // see docs/deploy/README.md before exposing this server publicly.
  authToken: process.env.API_AUTH_TOKEN || '',
};
