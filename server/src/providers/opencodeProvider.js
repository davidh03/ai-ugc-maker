import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
const cache = { value: null, expiresAt: 0 };
export async function getOpenCodeModels() { if (cache.value && cache.expiresAt > Date.now()) return cache.value; const { stdout } = await execFileP(process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode', ['models'], { env: { ...process.env, PATH: `/home/clez/.opencode/bin:${process.env.PATH || ''}` } }); const models = stdout.trim().split('\n').filter(Boolean).map(id => ({ id, name: id.split('/').pop(), description: '', default: id.includes('free'), reasoningEfforts: [] })); cache.value = models.length ? models : [{ id: 'opencode/mimo-v2.5-free', name: 'mimo-v2.5-free', description: 'Free local OpenCode model', default: true, reasoningEfforts: [] }]; cache.expiresAt = Date.now() + 30000; return cache.value; }
