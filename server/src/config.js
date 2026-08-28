import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  composer: process.env.COMPOSER || 'template',
  agentCmd: process.env.AGENT_CMD || '',
  maxDurationSec: Number(process.env.MAX_DURATION_SEC || 180),
  wordsPerMinute: 150,
};
