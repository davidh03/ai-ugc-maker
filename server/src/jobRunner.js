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
import { synthesizeCartesiaVoiceover } from './cartesiaTts.js';
import { buildNarrationScript } from './narration.js';
import { parsePresentationScript, narrationPlanPrompt } from './scriptParser.js';
import { optimizePrompt } from './promptOptimizer.js';
import { validateAssetBindings } from './revisionAssetBindings.js';
import { buildAudioMixPlan, materializeAudioMixArgs } from './audioMixPlan.js';


const execFileP = promisify(execFile);

async function probeDurationSec(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const probe = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    const value = Number(probe.stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

// When a structured Scene/Timecode script is provided, its own timecodes are
// the authoritative duration source in voiceover-driven mode — no synthesis
// or measurement needed, the total is simply the last scene's end time.
export function resolveScriptDrivenDurationSec(parsedScript, fallbackSec) {
  const lastScene = parsedScript?.scenes?.[parsedScript.scenes.length - 1];
  const endSec = Number(lastScene?.endSec);
  return Number.isFinite(endSec) && endSec > 0 ? Math.max(1, Math.ceil(endSec)) : fallbackSec;
}

export function pickVoiceoverSynth(job) {
  const provider = job.voiceoverProvider;
  const synthesize = provider === 'google-cloud-tts' ? synthesizeGoogleVoiceover
    : provider === 'minimax-tts' ? synthesizeMiniMaxVoiceover
    : provider === 'cartesia-tts' ? synthesizeCartesiaVoiceover
    : synthesizeOpenAIVoiceover;
  const voiceOptions = provider === 'google-cloud-tts' ? { voiceName: job.voiceoverVoice }
    : provider === 'minimax-tts' ? { voiceId: job.voiceoverVoice }
    : provider === 'cartesia-tts' ? { voiceId: job.voiceoverVoice }
    : { voice: job.voiceoverVoice };
  return { synthesize, voiceOptions };
}

// Freeform (non-structured) briefs have no per-scene timecodes to derive a
// duration from, so in voiceover-driven mode we synthesize the narration
// early and measure its real length via ffprobe — that measured length then
// becomes the job's authoritative durationSec before composition even starts.
async function resolveVoiceover(job, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const voiceoverPath = path.join(outputDir, 'voiceover.mp3');
  if (job.reuseVoiceoverFrom) {
    const source = path.join(config.dataDir, 'jobs', job.reuseVoiceoverFrom, 'voiceover.mp3');
    if (existsSync(source)) {
      copyFileSync(source, voiceoverPath);
      job.voiceoverScript = job.inheritedVoiceoverScript || job.voiceoverScript || '';
      job.voiceoverMeta = job.inheritedVoiceoverMeta || null;
      return { voiceoverPath, reused: true };
    }
    job.reuseVoiceoverFrom = '';
  }
  if (!job.voiceoverScript) job.voiceoverScript = buildNarrationScript({ brief: job.brief, style: job.style, durationSec: job.durationSec });
  const { synthesize, voiceOptions } = pickVoiceoverSynth(job);
  job.voiceoverMeta = await synthesize(job.voiceoverScript, voiceoverPath, voiceOptions);
  return { voiceoverPath, reused: false };
}

export function extractVoiceoverScript(html = '') {
  const match = String(html).match(/^\s*window\.__voiceoverScript\s*=\s*(.+);\s*$/m);
  if (!match) return '';
  const raw = match[1].trim();
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed.trim() : '';
  } catch {
    return '';
  }
}
const cancellationSignals = new Map();
const cancelledJobs = new Set();
const runtimeEnv = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` };

export function cancelJob(jobId) {
  cancelledJobs.add(jobId);
  const c = cancellationSignals.get(jobId);
  if (c?.abort) { c.abort(); cancellationSignals.delete(jobId); }
}

function throwIfCancelled(job) {
  if (cancelledJobs.has(job.id)) {
    const error = new Error('Job cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

export async function runJob(job) {
  const composer = pickComposer(job);
  try {
    throwIfCancelled(job);
    update(job, { status: 'running', startedAt: Date.now() });

    const reuseVideo = Boolean(job.reuseVideoFrom && job.stagePlan?.nodes?.find(node => node.id === 'render')?.action === 'reuse');
    const outputDir = path.join(config.dataDir, 'jobs', job.id);
    const finalOutput = path.join(outputDir, 'output.mp4');
    let compositionDir = null;
    if (reuseVideo) {
      const sourceJob = path.join(config.dataDir, 'jobs', job.reuseVideoFrom, 'output.mp4');
      if (!existsSync(sourceJob)) throw new Error('Reusable source video is missing; visual rerender required');
      mkdirSync(outputDir, { recursive: true }); copyFileSync(sourceJob, finalOutput);
      job.voiceoverScript = job.inheritedVoiceoverScript || job.voiceoverScript || '';
      update(job, { stage: 'render', workflowStatus: 'reused', progress: 100, outputRel: 'jobs/' + job.id + '/output.mp4' });
    } else {
      const parsedScript = parsePresentationScript(job.brief);
      if (parsedScript.detected) {
        job.originalBrief = job.originalBrief || job.brief;
        job.narrationPlan = parsedScript;
        job.voiceoverScript = parsedScript.script;
        job.voiceoverLocked = true;
        job.compositionBrief = parsedScript.scenes.map(scene => `${scene.title} (${scene.startSec}-${scene.endSec}s): ${scene.visual}${scene.onScreen ? ` On screen: ${scene.onScreen}.` : ''}`).join(' ') + (job.revisionReason ? ` REVISION REQUEST: ${job.revisionReason}` : '');
        if (job.durationMode === 'voiceover' && job.voiceover) job.durationSec = resolveScriptDrivenDurationSec(parsedScript, job.durationSec);
        update(job, { originalBrief: job.originalBrief, compositionBrief: job.compositionBrief, narrationPlan: parsedScript, voiceoverScript: parsedScript.script, durationSec: job.durationSec });
      }
      if (!parsedScript.detected && job.composer === 'agent') {
        update(job, { stage: 'prompt-optimizing', progress: 0 });
        const optimization = await optimizePrompt(job, path.join(config.dataDir, 'jobs', job.id));
        job.originalBrief = job.originalBrief || job.brief;
        job.brief = optimization.brief;
        update(job, { originalBrief: job.originalBrief, brief: job.brief, promptOptimization: { optimized: true, provider: optimization.provider, model: optimization.model }, workflowStatus: 'done', progress: 100 });
      }
      if (!parsedScript.detected && job.durationMode === 'voiceover' && job.voiceover) {
        update(job, { stage: 'voiceover', progress: 0 });
        const { voiceoverPath, reused } = await resolveVoiceover(job, outputDir);
        const measured = await probeDurationSec(voiceoverPath);
        if (measured) job.durationSec = Math.max(1, Math.ceil(measured));
        job.voiceoverLocked = true;
        job.voiceoverPreSynthesized = true;
        update(job, { stage: 'voiceover', workflowStatus: reused ? 'reused' : 'done', progress: 100, durationSec: job.durationSec, voiceoverScript: job.voiceoverScript, voiceoverMeta: job.voiceoverMeta });
      }
      if (job.workflow?.find(node => node.id === 'web-research')?.enabled) try {
        update(job, { stage: 'web-research', progress: 0 });
        const { brief, meta } = await enrichBriefWithWebReferences(job.brief);
        if (meta.detected) { job.brief = brief; job.webResearch = meta; update(job, { brief, webResearch: meta, workflowStatus: 'done', progress: 100 }); }
        else update(job, { stage: 'web-research', workflowStatus: 'done', progress: 100 });
      } catch (e) { console.warn('web research skipped:', e.message); }
      if (job.assets?.length) { update(job, { stage: 'asset-analysis', progress: 0 }); const assetManifest = await analyzeAssets(job.assets, config.dataDir); update(job, { stage: 'asset-analysis', workflowStatus: 'done', progress: 100, assetManifest }); }
      update(job, { stage: 'composing' });
      try { const { brief, meta } = await enrichBrief(job.brief); if (meta.detected) { job.brief = brief; job.transcript = meta; update(job, { brief, transcript: meta }); } } catch (e) { console.warn('transcript enrichment skipped:', e.message); }
      compositionDir = await composer.compose(job); throwIfCancelled(job);
      try { const { readFile } = await import('node:fs/promises'); const html = await readFile(path.join(compositionDir, 'index.html'), 'utf8'); const extracted = extractVoiceoverScript(html); if (extracted && !job.voiceoverLocked) job.voiceoverScript = extracted; if (job.assetBindings?.length) { const aliased = job.assetBindings.map(b => ({ ...b, sourceId: (html.indexOf('id="' + b.sourceId + '"') >= 0 || html.indexOf('class="' + b.sourceId) >= 0) ? b.sourceId : (b.targetKind === 'header-logo' ? 'brand-pill' : b.targetKind === 'operator-person' ? 'operator-visual panel' : b.targetKind === 'outro' ? 'outro-lockup' : b.sourceId) })); job.revisionValidation = { ...(job.revisionValidation || {}), assetBindings: validateAssetBindings(html, aliased) }; if (!job.revisionValidation.assetBindings.passed) { const missing = job.revisionValidation.assetBindings.results.filter(item => item.required && !item.satisfied).map(item => `${item.filename} at ${item.targetKind}`); throw new Error(`Required asset bindings missing: ${missing.join(', ')}`); } } } catch (error) { if (job.assetBindings?.length) throw error; /* fallback below */ }
      if (!job.voiceoverScript) job.voiceoverScript = buildNarrationScript({ brief: job.brief, style: job.style, durationSec: job.durationSec });
    }

    if (job.voiceover && !job.voiceoverPreSynthesized) {
      update(job, { stage: 'voiceover', progress: 0 });
      const voiceoverPath = path.join(outputDir, 'voiceover.mp3');
      if (job.reuseVoiceoverFrom) {
        const source = path.join(config.dataDir, 'jobs', job.reuseVoiceoverFrom, 'voiceover.mp3');
        if (existsSync(source)) { copyFileSync(source, voiceoverPath); job.voiceoverScript = job.inheritedVoiceoverScript || job.voiceoverScript; job.voiceoverMeta = job.inheritedVoiceoverMeta || null; update(job, { stage: 'voiceover', workflowStatus: 'reused', progress: 100, voiceoverMeta: job.voiceoverMeta, voiceoverScript: job.voiceoverScript }); }
        else job.reuseVoiceoverFrom = '';
      }
      if (!job.reuseVoiceoverFrom) {
        const { synthesize, voiceOptions } = pickVoiceoverSynth(job);
        job.voiceoverMeta = await synthesize(job.voiceoverScript || job.brief, voiceoverPath, voiceOptions);
        update(job, { stage: 'voiceover', workflowStatus: 'done', progress: 100, voiceoverMeta: job.voiceoverMeta, timedWords: job.timedWords || [] });
      }
    }
    if (!reuseVideo) {
      throwIfCancelled(job); update(job, { stage: 'linting' }); await lintComposition(compositionDir).catch(e => console.warn('lint skipped:', e.message));
      throwIfCancelled(job); update(job, { stage: 'rendering', progress: 0 }); await renderViaCli(compositionDir, job);
      let tmpOutput = path.join(compositionDir, 'output.mp4'); if (!existsSync(tmpOutput)) { const rendersDir = path.join(compositionDir, 'renders'); if (existsSync(rendersDir)) { const files = readdirSync(rendersDir).filter(f => f.endsWith('.mp4')); if (files.length > 0) tmpOutput = path.join(rendersDir, files[0]); } }
      if (existsSync(tmpOutput)) { mkdirSync(outputDir, { recursive: true }); copyFileSync(tmpOutput, finalOutput); const cleanOutput = path.join(outputDir, 'clean-video.mp4'); copyFileSync(tmpOutput, cleanOutput); job.artifactManifest = { ...(job.artifactManifest || {}), cleanVideo: { relPath: 'jobs/' + job.id + '/clean-video.mp4', sourceJobId: job.id }, finalVideo: { relPath: 'jobs/' + job.id + '/output.mp4', sourceJobId: job.id } }; update(job, { artifactManifest: job.artifactManifest }); }
    }

    // Music toggle: mix a bed under the video (user music asset, else a
    // synthesized ambient pad via ffmpeg). Best-effort — failure keeps the
    // silent video rather than failing the job.
    throwIfCancelled(job);
    if ((job.music || job.voiceover) && existsSync(finalOutput)) {
      update(job, { stage: 'music-mix', progress: 0 });
      try { await mixAudioBed(job, finalOutput); }
      catch (e) { console.warn('music mix skipped:', e.message); update(job, { stage: 'music-mix', workflowStatus: 'failed', error: String(e?.message || e).slice(0, 300) }); }
    }

    update(job, { stage: 'complete', status: 'done', progress: 100, outputRel: 'jobs/' + job.id + '/output.mp4', finishedAt: Date.now() });
  } catch (err) {
    const cancelled = err?.name === 'AbortError';
    update(job, cancelled
      ? { status: 'cancelled', finishedAt: Date.now() }
      : { status: 'failed', error: String(err?.message || err).slice(0, 500), finishedAt: Date.now() });
  } finally { cancellationSignals.delete(job.id); cancelledJobs.delete(job.id); }
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
  const musicAsset = (job.assets || []).find(asset => asset.category === 'music' && asset.path && existsSync(path.join(config.dataDir, asset.path)));
  const voiceoverPath = path.join(config.dataDir, 'jobs', job.id, 'voiceover.mp3');
  const hasVoice = Boolean(job.voiceover && existsSync(voiceoverPath));
  let musicPath = '';
  if (job.music) {
    if (musicAsset) musicPath = path.join(config.dataDir, musicAsset.path);
    else { musicPath = path.join(config.dataDir, 'jobs', job.id, 'bed.wav'); job.musicMeta = generateMusicBed(musicPath, job.durationSec, job.id, job.brief); }
  }
  const plan = buildAudioMixPlan({ voiceover: hasVoice, music: Boolean(job.music && musicPath), uploadedMusic: Boolean(musicAsset), durationSec: job.durationSec, voiceoverOffsetSec: Number(job.voiceoverOffsetSec) || 0 });
  if (!plan.args.length) return;
  const tmp = videoPath + '.music.mp4';
  const args = materializeAudioMixArgs(plan, { videoPath, voiceoverPath, musicPath, outputPath: tmp });
  await execFileP('ffmpeg', args);
  const probe = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmp]);
  const duration = Number(probe.stdout.trim());
  if (!Number.isFinite(duration) || Math.abs(duration - Number(job.durationSec)) > 0.1) throw new Error(`Final output duration ${duration}s does not match requested ${job.durationSec}s`);
  copyFileSync(tmp, videoPath);
  job.revisionValidation = { ...(job.revisionValidation || {}), timeline: { ...(job.revisionValidation?.timeline || {}), requestedSec: Number(job.durationSec), finalSec: duration }, passed: job.revisionValidation?.assetBindings?.passed !== false };
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
