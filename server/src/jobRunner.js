import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pickComposer } from './composer/index.js';
import { upsertJob } from './store.js';
import { config } from './config.js';
import { enrichBrief } from './youtubeTranscript.js';
import { generateMusicBed } from './musicBed.js';
import { updateWorkflow } from './workflow.js';
import { analyzeAssets } from './assetAnalyzer.js';
import { enrichBriefWithWebReferences } from './webResearch.js';
import { synthesizeGoogleVoiceover } from './googleTts.js';
import { synthesizeOpenAIVoiceover } from './openaiTts.js';
import { synthesizeMiniMaxVoiceover } from './minimaxTts.js';
import { buildNarrationScript } from './narration.js';
import { parsePresentationScript, narrationPlanPrompt } from './scriptParser.js';
import { optimizePrompt } from './promptOptimizer.js';


const execFileP = promisify(execFile);
const cancellationSignals = new Map();
const runtimeEnv = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` };

export function cancelJob(jobId) {
  const c = cancellationSignals.get(jobId);
  if (c) { c.abort(); cancellationSignals.delete(jobId); }
}

export async function runJob(job) {
  const composer = pickComposer(job);
  try {
    update(job, { status: 'running', startedAt: Date.now() });

    const parsedScript = parsePresentationScript(job.brief);
    if (parsedScript.detected) {
      job.originalBrief = job.brief;
      job.narrationPlan = parsedScript;
      job.voiceoverScript = parsedScript.script;
      job.compositionBrief = parsedScript.scenes.map(scene => `${scene.title} (${scene.startSec}-${scene.endSec}s): ${scene.visual}${scene.onScreen ? ` On screen: ${scene.onScreen}.` : ''}`).join(' ');
      update(job, { originalBrief: job.originalBrief, compositionBrief: job.compositionBrief, narrationPlan: parsedScript, voiceoverScript: parsedScript.script });
    }

    if (!parsedScript.detected && job.composer === 'agent') {
      update(job, { stage: 'prompt-optimizing', progress: 0 });
      const optimization = await optimizePrompt(job, path.join(config.dataDir, 'jobs', job.id));
      job.originalBrief = job.brief;
      job.brief = optimization.brief;
      update(job, { originalBrief: job.originalBrief, brief: job.brief, promptOptimization: { optimized: true, provider: optimization.provider, model: optimization.model }, workflowStatus: 'done', progress: 100 });
    }

    if (job.workflow?.find(node => node.id === 'web-research')?.enabled) try {
      update(job, { stage: 'web-research', progress: 0 });
      const { brief, meta } = await enrichBriefWithWebReferences(job.brief);
      if (meta.detected) { job.brief = brief; job.webResearch = meta; update(job, { brief, webResearch: meta, workflowStatus: 'done', progress: 100 }); }
      else update(job, { stage: 'web-research', workflowStatus: 'done', progress: 100 });
    } catch (e) { console.warn('web research skipped:', e.message); }

    if (job.assets?.length) {
      update(job, { stage: 'asset-analysis', progress: 0 });
      const assetManifest = await analyzeAssets(job.assets, config.dataDir);
      update(job, { stage: 'asset-analysis', workflowStatus: 'done', progress: 100, assetManifest });
    }

    update(job, { stage: 'composing' });
    // YouTube transcript enrichment: if the brief references a YouTube URL,
    // fetch its captions and append the transcript so the composer has real
    // content to work from. Strictly best-effort — a missing/blocked
    // transcript must never fail the job, so any error is caught and the
    // original brief (with the URL intact) is used unchanged.
    try {
      const { brief, meta } = await enrichBrief(job.brief);
      if (meta.detected) {
        job.brief = brief;
        job.transcript = meta;
        update(job, { brief, transcript: meta });
      }
    } catch (e) {
      console.warn('transcript enrichment skipped:', e.message);
    }

    const compositionDir = await composer.compose(job);
    if (!job.voiceoverScript) {
      try {
        const { readFile } = await import('node:fs/promises');
        const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8');
        const match = html.match(/window\.__voiceoverScript\s*=\s*(['"])(.*?)\1\s*;/s);
        if (match) job.voiceoverScript = JSON.parse(match[2]);
      } catch { /* use the format-aware fallback below */ }
    }
    if (!job.voiceoverScript) job.voiceoverScript = buildNarrationScript({ brief: job.brief, style: job.style, durationSec: job.durationSec });

    if (job.voiceover) {
      update(job, { stage: 'voiceover', progress: 0 });
      const voiceoverPath = path.join(config.dataDir, 'jobs', job.id, 'voiceover.mp3');
      const synthesize = job.voiceoverProvider === 'google-cloud-tts' ? synthesizeGoogleVoiceover : job.voiceoverProvider === 'minimax-tts' ? synthesizeMiniMaxVoiceover : synthesizeOpenAIVoiceover;
      job.voiceoverMeta = await synthesize(job.voiceoverScript || job.brief, voiceoverPath);
      try {
        const timed = await execFileP('npx', ['hyperframes', 'transcribe', voiceoverPath, '--json'], { cwd: path.dirname(voiceoverPath), env: runtimeEnv, maxBuffer: 1024 * 1024 });
        const transcript = JSON.parse(timed.stdout);
        if (transcript.transcriptPath && existsSync(transcript.transcriptPath)) {
          const { readFile } = await import('node:fs/promises');
          job.timedWords = JSON.parse(await readFile(transcript.transcriptPath, 'utf8'));
          job.voiceoverMeta.transcript = transcript;
        }
      } catch (error) { job.voiceoverMeta.transcriptionWarning = String(error.message || error).slice(0, 240); }
      update(job, { stage: 'voiceover', workflowStatus: 'done', progress: 100, voiceoverMeta: job.voiceoverMeta, timedWords: job.timedWords || [] });
    }

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
    if ((job.music || job.voiceover) && existsSync(finalOutput)) {
      update(job, { stage: 'music-mix', progress: 0 });
      try { await mixAudioBed(job, finalOutput); } catch (e) { console.warn('audio mix skipped:', e.message); }
    }

    update(job, { stage: 'complete', status: 'done', progress: 100, outputRel: 'jobs/' + job.id + '/output.mp4', finishedAt: Date.now() });
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    update(job, cancelled
      ? { status: 'cancelled', finishedAt: Date.now() }
      : { status: 'failed', error: String(err?.message || err).slice(0, 500), finishedAt: Date.now() });
  } finally { cancellationSignals.delete(job.id); }
}

async function lintComposition(dir) {
  await execFileP('npx', ['hyperframes', 'lint', dir], { cwd: dir, env: runtimeEnv });
}

async function renderViaCli(dir, job) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    cancellationSignals.set(job.id, controller);
    const child = spawn('npx', ['hyperframes', 'render', dir], { cwd: dir, signal: controller.signal, env: runtimeEnv });
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
  const voiceoverPath = path.join(config.dataDir, 'jobs', job.id, 'voiceover.mp3');
  const tmp = videoPath + '.music.mp4';
  if (job.voiceover && existsSync(voiceoverPath) && musicAsset && existsSync(path.join(config.dataDir, musicAsset.path))) {
    const bed = path.join(config.dataDir, musicAsset.path);
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-stream_loop', '-1', '-i', bed, '-i', voiceoverPath,
      '-filter_complex', '[1:a]volume=0.18[bed];[bed][2:a]amix=inputs=2:duration=first:dropout_transition=2[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-t', String(job.durationSec), tmp]);
  } else if (job.voiceover && existsSync(voiceoverPath)) {
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-i', voiceoverPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-t', String(job.durationSec), tmp]);
  } else if (musicAsset && existsSync(path.join(config.dataDir, musicAsset.path))) {
    const bed = path.join(config.dataDir, musicAsset.path);
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-stream_loop', '-1', '-i', bed,
      '-filter_complex', '[1:a]volume=1.0,lowpass=f=9000[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-t', '999', tmp]);
  } else {
    const bedPath = path.join(config.dataDir, 'jobs', job.id, 'bed.wav');
    job.musicMeta = generateMusicBed(bedPath, job.durationSec, job.id, job.brief);
    await execFileP('ffmpeg', ['-y', '-i', videoPath, '-i', bedPath,
      '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-shortest', '-t', String(job.durationSec), tmp]);
  }
  copyFileSync(tmp, videoPath);
}

function update(job, patch) {
  if (patch.stage && Array.isArray(job.workflow)) {
    const current = job.workflow.find(node => node.status === 'running');
    if (current && current.id !== patch.stage) job.workflow = updateWorkflow(job.workflow, current.id, { status: 'done' });
    job.workflow = updateWorkflow(job.workflow, patch.stage, { status: patch.workflowStatus || (patch.status === 'done' ? 'done' : 'running'), error: patch.error });
  }
  const { workflowStatus: _workflowStatus, ...jobPatch } = patch;
  Object.assign(job, jobPatch); upsertJob(job);
}
