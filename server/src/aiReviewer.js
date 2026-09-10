import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAX_REVIEW_ITERATIONS = 3;
export const MAX_REVIEWER_ITERATIONS = 10;

export function normalizeReviewerLimit(value, fallback = DEFAULT_MAX_REVIEW_ITERATIONS) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > MAX_REVIEWER_ITERATIONS) throw new TypeError(`maxReviewerIterations must be an integer between 0 and ${MAX_REVIEWER_ITERATIONS}`);
  return numeric;
}
const REVIEWER_BIN = process.env.CODEX_BIN || '/home/clez/.local/bin/codex';

const CATEGORY_SCOPES = {
  voiceover: 'voiceover',
  narration: 'voiceover',
  audio: 'voiceover',
  asset: 'assets',
  assets: 'assets',
  visual: 'visuals',
  visuals: 'visuals',
  timeline: 'timeline',
  timing: 'timeline',
  caption: 'captions',
  captions: 'captions',
  branding: 'branding',
};

export function normalizeReview(value = {}) {
  if (!value || typeof value.satisfied !== 'boolean') throw new TypeError('review satisfied must be a boolean');
  if (!Array.isArray(value.findings)) throw new TypeError('review findings must be an array');
  const findings = value.findings.map(item => {
    const finding = {
      category: String(item?.category || 'visuals').toLowerCase(),
      severity: String(item?.severity || 'medium').toLowerCase(),
      issue: String(item?.issue || item?.description || 'Unspecified issue'),
    };
    if (item?.evidence) finding.evidence = String(item.evidence);
    if (item?.recommendation) finding.recommendation = String(item.recommendation);
    return finding;
  });
  return { satisfied: value.satisfied && findings.length === 0, findings, summary: String(value.summary || '') };
}

export function regenerationScope(findings = []) {
  return [...new Set(findings.map(item => CATEGORY_SCOPES[String(item?.category || '').toLowerCase()] || 'visuals'))];
}

export async function runReviewerLoop({ review, regenerate, maxIterations = DEFAULT_MAX_REVIEW_ITERATIONS, initialCandidate = null }) {
  if (typeof review !== 'function' || typeof regenerate !== 'function') throw new TypeError('review and regenerate functions are required');
  const limit = normalizeReviewerLimit(maxIterations);
  const history = [];
  let candidate = initialCandidate;
  for (let iteration = 0; iteration <= limit; iteration += 1) {
    const result = normalizeReview(await review(candidate, iteration));
    history.push({ iteration, ...result });
    if (result.satisfied || iteration === limit) return { satisfied: result.satisfied, iterations: iteration, candidate, finalReview: result, history };
    const nextCandidate = await regenerate({ iteration: iteration + 1, scope: regenerationScope(result.findings), findings: result.findings, candidate });
    if (!nextCandidate || nextCandidate === candidate) throw new Error('Reviewer correction did not produce a new candidate');
    if (candidate?.outputPath && nextCandidate.outputPath === candidate.outputPath) throw new Error('Reviewer correction reused the same output artifact');
    candidate = nextCandidate;
  }
  throw new Error('Reviewer loop exited unexpectedly');
}

function reviewerPrompt(job, jobDir) {
  return `You are the final quality reviewer for a generated AI video. Review the actual artifact in ${jobDir}.

Inspect:
- output.mp4 with ffprobe for playable video/audio streams and duration
- index.html for scene timing metadata, required assets, narration script, and timeline structure
- representative frames from output.mp4 for visual quality, readability, composition, asset usage, branding, and scene continuity
- the audio/narration alignment against the visual scene timing

Return ONLY valid JSON in ${path.join(jobDir, 'ai-review.json')} with this exact shape:
{
  "satisfied": true,
  "summary": "short explanation",
  "findings": [
    {
      "category": "voiceover|assets|visuals|timeline|captions|branding|audio",
      "severity": "low|medium|high",
      "issue": "specific problem",
      "evidence": "timecode, filename, or measurable evidence",
      "recommendation": "specific correction"
    }
  ]
}

Rules:
- Set satisfied=true only when there are no material problems.
- Be granular. Identify whether the correction belongs to voiceover, assets, visuals, timeline, captions, branding, or audio.
- Never silently ignore a required asset, unreadable text, rushed/misaligned narration, missing scene, broken transition, or invalid duration.
- Do not edit index.html or output.mp4. Write only ai-review.json.
- Do not invent problems without evidence from the artifact.

Job ID: ${job.id}
Requested style: ${job.style || 'product'}
Current duration setting: ${job.durationSec}
Voiceover enabled: ${Boolean(job.voiceover)}
Required asset metadata: ${JSON.stringify(job.assetManifest || job.assets || [])}`;
}

export function reviewVideoWithCodex(job, jobDir, { binary = REVIEWER_BIN, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const reviewDir = mkdtempSync(path.join(tmpdir(), 'ai-ugc-review-'));
    try { cpSync(jobDir, reviewDir, { recursive: true }); } catch (error) { rmSync(reviewDir, { recursive: true, force: true }); reject(error); return; }
    const reviewPath = path.join(reviewDir, 'ai-review.json');
    try { if (existsSync(reviewPath)) unlinkSync(reviewPath); } catch { /* best effort */ }
    const args = ['exec', '--model', job.reviewerModel || job.model || 'gpt-5.6-luna', '--cd', reviewDir, '--sandbox', 'workspace-write', '--ask-for-approval', 'never', '--skip-git-repo-check', '--ephemeral', '--color', 'never', reviewerPrompt(job, reviewDir)];
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['HOME', 'PATH', 'USER', 'LOGNAME', 'TMPDIR', 'OPENAI_API_KEY', 'CODEX_HOME', 'OPENCODE_GO_API_KEY'].includes(key)));
    env.PATH = `/home/clez/.local/bin:/home/clez/.opencode/bin:${process.env.PATH || ''}`;
    const child = spawn(binary, args, { cwd: reviewDir, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); rmSync(reviewDir, { recursive: true, force: true }); reject(new Error('AI reviewer timed out')); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); rmSync(reviewDir, { recursive: true, force: true }); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw new Error(`AI reviewer exited ${code}: ${(stderr || stdout).slice(0, 1000)}`);
        const parsed = JSON.parse(readFileSync(reviewPath, 'utf8'));
        resolve(normalizeReview(parsed));
      } catch (error) {
        reject(error.message?.startsWith('AI reviewer exited') ? error : new Error(`AI reviewer did not produce valid ai-review.json: ${error.message}`));
      } finally { rmSync(reviewDir, { recursive: true, force: true }); }
    });
  });
}
