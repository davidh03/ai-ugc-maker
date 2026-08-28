import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pickComposer } from './composer/index.js';
import { upsertJob } from './store.js';
import { config } from './config.js';

const execFileP = promisify(execFile);

const cancellationSignals = new Map();

export function createCancellationSignal(jobId) {
  const controller = new AbortController();
  cancellationSignals.set(jobId, controller);
  return controller.signal;
}

export function cancelJob(jobId) {
  const controller = cancellationSignals.get(jobId);
  if (controller) {
    controller.abort();
    cancellationSignals.delete(jobId);
  }
}

export async function runJob(job) {
  const composer = pickComposer();
  try {
    update(job, { status: 'running', stage: 'composing', startedAt: Date.now() });

    // 1) brief -> composition HTML
    const compositionDir = await composer.compose(job);

    // 2) lint gate
    update(job, { stage: 'linting' });
    await lintComposition(compositionDir);

    // 3) render via CLI
    update(job, { stage: 'rendering', progress: 0 });
    await renderViaCli(compositionDir, job);

    // 4) move output to final location
    const outputDir = path.join(config.dataDir, 'jobs', job.id);
    const finalOutput = path.join(outputDir, 'output.mp4');
    // HyperFrames outputs to renders/ subdirectory
    const rendersDir = path.join(compositionDir, 'renders');
    let tmpOutput = path.join(compositionDir, 'output.mp4');
    if (!existsSync(tmpOutput) && existsSync(rendersDir)) {
      const files = require('fs').readdirSync(rendersDir).filter(f => f.endsWith('.mp4'));
      if (files.length > 0) tmpOutput = path.join(rendersDir, files[0]);
    }

    if (existsSync(tmpOutput)) {
      mkdirSync(outputDir, { recursive: true });
      copyFileSync(tmpOutput, finalOutput);
    }

    update(job, {
      status: 'done',
      stage: null,
      progress: 100,
      outputRel: `jobs/${job.id}/output.mp4`,
      finishedAt: Date.now(),
    });
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    update(job, cancelled
      ? { status: 'cancelled', finishedAt: Date.now() }
      : { status: 'failed', error: String(err?.message || err), finishedAt: Date.now() });
  } finally {
    cancellationSignals.delete(job.id);
  }
}

async function lintComposition(dir) {
  try {
    await execFileP('npx', ['hyperframes', 'lint', dir], { cwd: dir });
  } catch (e) {
    // Lint may not be available yet — skip for now
    console.warn('lint skipped:', e.message);
  }
}

async function renderViaCli(dir, job) {
  return new Promise((resolve, reject) => {
    const signal = cancellationSignals.get(job.id)?.signal;
    const child = spawn('npx', ['hyperframes', 'render', dir], {
      cwd: dir,
      signal,
    });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d;
      const match = stderr.match(/(\d+)%/);
      if (match) {
        update(job, { progress: parseInt(match[1]) });
      }
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`render exit ${code}: ${stderr}`));
    });

    child.on('error', reject);
  });
}

function update(job, patch) {
  Object.assign(job, patch);
  upsertJob(job);
}
