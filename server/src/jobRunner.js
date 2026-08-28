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

    // Music toggle: mix a bed under the video (user music asset, else a
    // synthesized ambient pad via ffmpeg). Best-effort — failure keeps the
    // silent video rather than failing the job.
    if (job.music && existsSync(finalOutput)) {
      try { await mixAudioBed(job, finalOutput); } catch (e) { console.warn('music mix skipped:', e.message); }
    }

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

// Mix a background-music bed under the video. Prefers an uploaded music
// asset if present; otherwise synthesizes a quiet ambient pad (A-minor triad
// + lowpass) with ffmpeg's lavfi — no MusicGen/torch needed on the laptop.
async function mixAudioBed(job, videoPath) {
  const musicAsset = (job.assets || []).find(a => a.category === 'music' && a.path);
  const tmp = videoPath + '.music.mp4';
  if (musicAsset && existsSync(path.join(config.dataDir, musicAsset.path))) {
    const bed = path.join(config.dataDir, musicAsset.path);
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-stream_loop', '-1', '-i', bed,
      '-filter_complex', '[1:a]volume=1.0,lowpass=f=9000[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-t', '999', tmp]);
  } else {
    // ambient pad: A2(110) + E3(164.81) + A3(220), quiet, lowpassed
    await execFileP('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=10',
      '-f', 'lavfi', '-i', 'sine=frequency=164.81:duration=10',
      '-f', 'lavfi', '-i', 'sine=frequency=220:duration=10',
      '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3,volume=2.0,lowpass=f=700',
      '-ar', '44100', '-ac', '2', path.join(config.dataDir, 'jobs', job.id, 'bed.m4a')]);
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-stream_loop', '-1', '-i', path.join(config.dataDir, 'jobs', job.id, 'bed.m4a'),
      '-filter_complex', '[1:a]volume=1.0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-t', '999', tmp]);
  }
  copyFileSync(tmp, videoPath);
}

function update(job, patch) { Object.assign(job, patch); upsertJob(job); }
