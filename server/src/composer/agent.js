import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

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
// transient provider outages (or exhausted subscription credit) —
// retrying them is safe: the model never streamed, so the attempt billed nothing.
function isTransientGatewayError(output) {
  return /UnknownError/.test(output) && /Unexpected server error/.test(output);
}

// Copy the job's uploaded assets into the job workspace so the agent can
// reference them by relative path in the composition. Returns the list of
// usable assets with their relative paths. `required` defaults to true.
function stageAssets(job, jobDir) {
  const assets = (job.assets || []).filter(a => a && a.filename && a.path);
  if (assets.length === 0) return [];
  const assetDir = path.join(jobDir, 'assets');
  mkdirSync(assetDir, { recursive: true });
  const staged = [];
  for (const a of assets) {
    const src = path.join(DATA_DIR, a.path);
    if (!existsSync(src)) continue;
    const dest = path.join(assetDir, a.filename);
    try { copyFileSync(src, dest); staged.push({ filename: a.filename, category: a.category, rel: 'assets/' + a.filename, required: a.required !== false }); }
    catch (e) { console.warn('asset copy failed:', a.path, e.message); }
  }
  return staged;
}

function runOnce(agentBin, args, jobDir, model) {
  return new Promise((resolve, reject) => {
    const agentEnv = { ...process.env, PATH: (process.env.HOME || '/home/clez') + '/.opencode/bin:' + process.env.PATH };
    // Only inject the paid opencode-go key for paid models. Free Zen models
    // (opencode/*-free) authenticate via ~/.local/share/opencode/auth.json —
    // overriding OPENCODE_API_KEY with a dead key breaks them.
    if (model.startsWith('opencode-go/') && envVars.OPENCODE_API_KEY) {
      agentEnv.OPENCODE_API_KEY = envVars.OPENCODE_API_KEY;
    }

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
    const jobDir = path.join(DATA_DIR, 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    const agentName = job.agent || 'opencode';
    const agentBin = AGENT_BINS[agentName];
    if (!agentBin || !existsSync(agentBin)) throw new Error('Agent not found: ' + agentName);

    // Stage assets into the job workspace BEFORE prompting, so the agent
    // can see and use them by relative path.
    const staged = stageAssets(job, jobDir);

    let prompt = 'Create index.html: ' + job.brief + '. ' + job.durationSec + 's ' + job.style + ' video. 1920x1080. Use GSAP animations. Include data-composition-id, data-width, data-height, class=clip, data-track-index, data-start, data-duration attributes on divs. Add window.__timelines.';
    if (staged.length > 0) {
      const req = staged.filter(a => a.required);
      const opt = staged.filter(a => !a.required);
      if (req.length > 0) {
        prompt += ' REQUIRED assets (the video MUST include these, do not skip them; relative paths from the working directory): ' +
          req.map(a => a.rel + ' (' + a.category + ')').join(', ') + '.';
      }
      if (opt.length > 0) {
        prompt += ' OPTIONAL assets (use only if they fit the video naturally; relative paths): ' +
          opt.map(a => a.rel + ' (' + a.category + ')').join(', ') + '.';
      }
      prompt += ' Reference them in the composition (e.g. <img src="' + staged[0].rel + '"> for the first image). Animate REQUIRED assets prominently rather than ignoring them.';
    }
    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    // Default to free OpenCode Zen model (no subscription needed).
    const model = job.model || 'opencode/mimo-v2.5-free';
    const args = agentName === 'opencode'
      ? ['run', prompt, '--model', model, '--dir', jobDir, '--pure', '--auto']
      : [prompt];

    const maxAttempts = Number(process.env.AGENT_MAX_ATTEMPTS || 5);
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await runOnce(agentBin, args, jobDir, model);
        // Record which staged assets actually made it into the composition,
        // and flag required ones that were ignored.
        if (staged.length > 0) {
          const html = readFileSync(path.join(jobDir, 'index.html'), 'utf8');
          const used = staged.filter(a => html.includes(a.filename));
          job.assetsUsed = used.map(a => a.filename);
          job.requiredAssetsNotUsed = staged.filter(a => a.required && !html.includes(a.filename)).map(a => a.filename);
        }
        return jobDir;
      } catch (err) {
        lastErr = err;
        const output = err.output || String(err.message || err);
        try { writeFileSync(path.join(jobDir, 'agent.log'), output.slice(0, 20000)); } catch {}
        const retryable = isTransientGatewayError(output);
        if (!retryable || attempt === maxAttempts) break;
        await new Promise(r => setTimeout(r, attempt * 10000)); // 10s, 20s, 30s, 40s backoff
      }
    }
    const detail = (lastErr.output || String(lastErr.message || lastErr)).slice(0, 300);
    throw new Error('Agent exited ' + lastErr.code + ': ' + detail + ' [attempts=' + maxAttempts + ']');
  }
};