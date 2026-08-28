import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pickComposer } from './composer/index.js';
import { upsertJob } from './store.js';
import { config } from './config.js';

const execFileP = promisify(execFile);
const cancellationSignals = new Map();

export function cancelJob(jobId) {
  const c = cancellationSignals.get(jobId);
  if (c) { c.abort(); cancellationSignals.delete(jobId); }
}

export async function runJob(job) {
  const composer = pickComposer(job);
  try {
    update(job, { status: 'running', stage: 'composing', startedAt: Date.now() });
    const compositionDir = await composer.compose(job);

    update(job, { stage: 'linting' });
    await lintComposition(compositionDir).catch(e => console.warn('lint skipped:', e.message));

    update(job, { stage: 'rendering', progress: 0 });
    await renderViaCli(compositionDir, job);

    const outputDir = path.join(config.dataDir, 'jobs', job.id);
    const finalOutput = path.join(outputDir, 'output.mp4');
    let tmpOutput = path.join(compositionDir, 'output.mp4');
    if (!existsSync(tmpOutput)) {
      const rendersDir = path.join(compositionDir, 'renders');
      if (existsSync(rendersDir)) {
        const files = readdirSync(rendersDir).filter(f => f.endsWith('.mp4'));
        if (files.length > 0) tmpOutput = path.join(rendersDir, files[0]);
      }
    }
    if (existsSync(tmpOutput)) { mkdirSync(outputDir, { recursive: true }); copyFileSync(tmpOutput, finalOutput); }

    update(job, { status: 'done', stage: null, progress: 100, outputRel: 'jobs/' + job.id + '/output.mp4', finishedAt: Date.now() });
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    update(job, cancelled
      ? { status: 'cancelled', finishedAt: Date.now() }
      : { status: 'failed', error: String(err?.message || err).slice(0, 500), finishedAt: Date.now() });
  } finally { cancellationSignals.delete(job.id); }
}

async function lintComposition(dir) {
  await execFileP('npx', ['hyperframes', 'lint', dir], { cwd: dir });
}

async function renderViaCli(dir, job) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    cancellationSignals.set(job.id, controller);
    const child = spawn('npx', ['hyperframes', 'render', dir], { cwd: dir, signal: controller.signal });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; const m = stderr.match(/(\d+)%/); if (m) update(job, { progress: parseInt(m[1]) }); });
    child.on('close', code => code === 0 ? resolve() : reject(new Error('render exit ' + code + ': ' + stderr.slice(0, 300))));
    child.on('error', reject);
  });
}

function update(job, patch) { Object.assign(job, patch); upsertJob(job); }
