import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const lines = readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    const e = {};
    for (const l of lines) { const i = l.indexOf('='); if (i > 0) e[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
    return e;
  } catch { return {}; }
}
const envVars = loadEnv();

const AGENT_BINS = {
  opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode',
  claude: 'claude', codex: 'codex',
};

// opencode-go gateway 5xx ("Unexpected server error" + ref). These are
// transient provider outages — retrying them is safe and cheap (the model
// never streamed, so the failed attempt billed nothing).
function isTransientGatewayError(output) {
  return /UnknownError/.test(output) && /Unexpected server error/.test(output);
}

function runOnce(agentBin, args, jobDir) {
  return new Promise((resolve, reject) => {
    const agentEnv = { ...process.env, PATH: (process.env.HOME || '/home/clez') + '/.opencode/bin:' + process.env.PATH };
    if (envVars.OPENCODE_API_KEY) agentEnv.OPENCODE_API_KEY = envVars.OPENCODE_API_KEY;

    const child = spawn(agentBin, args, { cwd: jobDir, stdio: ['ignore', 'pipe', 'pipe'], env: agentEnv });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (existsSync(path.join(jobDir, 'index.html'))) return resolve(jobDir);
      reject({ code, output: (stderr || stdout) });
    });
    child.on('error', reject);
  });
}

export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    const agentName = job.agent || 'opencode';
    const agentBin = AGENT_BINS[agentName];
    if (!agentBin || !existsSync(agentBin)) throw new Error('Agent not found: ' + agentName);

    const hasAssets = (job.assets || []).length > 0;
    const prompt = 'Create index.html: ' + job.brief + '. ' + job.durationSec + 's ' + job.style + ' video. 1920x1080. Use GSAP animations. Include data-composition-id, data-width, data-height, class=clip, data-track-index, data-start, data-duration attributes on divs. Add window.__timelines.' + (hasAssets ? ' Available: images and video clips.' : '');

    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    const model = job.model || 'opencode-go/mimo-v2.5';
    const args = agentName === 'opencode'
      ? ['run', prompt, '--model', model, '--pure', '--auto']
      : [prompt];

    const maxAttempts = Number(process.env.AGENT_MAX_ATTEMPTS || 3);
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await runOnce(agentBin, args, jobDir);
      } catch (err) {
        lastErr = err;
        const output = err.output || String(err.message || err);
        try { writeFileSync(path.join(jobDir, 'agent.log'), output.slice(0, 20000)); } catch {}
        const retryable = isTransientGatewayError(output);
        if (!retryable || attempt === maxAttempts) break;
        await new Promise(r => setTimeout(r, attempt * 10000)); // 10s, 20s backoff
      }
    }
    const detail = (lastErr.output || String(lastErr.message || lastErr)).slice(0, 300);
    throw new Error('Agent exited ' + lastErr.code + ': ' + detail + ' [attempts=' + maxAttempts + ']');
  }
};