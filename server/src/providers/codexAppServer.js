import { spawn as defaultSpawn } from 'node:child_process';
import { once } from 'node:events';

const DEFAULT_TIMEOUT_MS = 30000;
const OVERLOAD_CODE = -32001;

function resolveBinary() { return process.env.CODEX_BIN || '/home/clez/.local/bin/codex'; }

export class CodexAppServer {
  constructor({ spawn = defaultSpawn, binary = resolveBinary, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.spawn = spawn; this.binary = binary; this.timeoutMs = timeoutMs; this.child = null; this.buffer = ''; this.nextId = 1; this.pending = new Map(); this.notifications = new Map(); this.starting = null;
  }
  on(method, handler) { this.notifications.set(method, handler); return () => this.notifications.delete(method); }
  async ensureStarted() {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.#start().finally(() => { this.starting = null; });
    return this.starting;
  }
  async #start() {
    const child = this.spawn(this.binary(), ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    this.child = child;
    child.stdout.on('data', chunk => this.#onData(chunk));
    child.on('close', () => this.#onExit(new Error('Codex app-server exited')));
    child.on('error', err => this.#onExit(err));
    await this.#request('initialize', { clientInfo: { name: 'ai_ugc_maker', title: 'AI UGC Maker', version: '1.0.0' } }, false);
    this.#send({ method: 'initialized', params: {} });
  }
  #onData(chunk) {
    this.buffer += chunk.toString();
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      try { this.#onMessage(JSON.parse(line)); } catch { /* malformed child diagnostics are ignored */ }
    }
  }
  #onMessage(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(Object.assign(new Error(message.error.message || 'Codex request failed'), { code: message.error.code, data: message.error.data })); else entry.resolve(message.result);
      return;
    }
    if (message.method && this.notifications.has(message.method)) this.notifications.get(message.method)(message.params || {});
  }
  #onExit(error) { this.child = null; for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); } this.pending.clear(); }
  #send(message) { if (!this.child?.stdin?.writable) throw new Error('Codex app-server unavailable'); this.child.stdin.write(JSON.stringify(message) + '\n'); }
  #request(method, params = {}, retry = true) {
    const run = () => new Promise((resolve, reject) => { const id = this.nextId++; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, this.timeoutMs); this.pending.set(id, { resolve, reject, timer }); try { this.#send({ method, id, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    return run().catch(error => { if (retry && error.code === OVERLOAD_CODE) return new Promise(r => setTimeout(r, 250)).then(() => this.#request(method, params, false)); throw error; });
  }
  async request(method, params = {}) { await this.ensureStarted(); return this.#request(method, params); }
  async stop() { if (!this.child) return; this.child.kill('SIGTERM'); await once(this.child, 'close').catch(() => {}); this.child = null; }
}

export function createCodexAppServer(options) { return new CodexAppServer(options); }
