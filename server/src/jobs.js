import { createWorkflow } from './workflow.js';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { config } from './config.js';
import { extractUrls } from './webResearch.js';
import { normalizeGenerationSettings } from './generationSettings.js';
import { buildChangeSet } from './revisionChangeSet.js';
import { planRevision } from './revisionPlanner.js';
import { createPromptProvenance } from './promptProvenance.js';
import { resolveRevisionTargets } from './revisionTargetResolver.js';
import { buildAssetBindings } from './revisionAssetBindings.js';
import { normalizeReviewerLimit } from './aiReviewer.js';

const VALID_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];const TRANSITIONS = { queued: ['running', 'cancelled'], running: ['done', 'failed', 'cancelled'], done: [], failed: [], cancelled: [] };
export const COMPOSERS = ['template', 'agent'];
export const PROVIDERS = ['opencode', 'openai-codex'];
export function canTransition(from, to) { return TRANSITIONS[from]?.includes(to) ?? false; }
export function validateTransition(job, to) { if (!TRANSITIONS[to]) throw new Error(`Invalid status: ${to}`); if (!canTransition(job.status, to)) throw new Error(`Cannot transition from ${job.status} to ${to}`); return true; }
export function wordBudget(durationSec, wpm = config.wordsPerMinute) { return Math.round(durationSec * wpm / 60); }
export function normalizeJobInput(input = {}) { const composer = input.composer || (input.agent && input.agent !== 'none' ? 'agent' : 'template'); const provider = input.provider || (input.agent && input.agent !== 'none' ? input.agent : ''); return { ...input, composer, provider, agent: composer === 'template' ? 'none' : provider }; }
export function createJob(input) {
  const normalized = normalizeJobInput(input);
  const { brief, durationSec, style = 'product', music = false, voiceover = false, voiceoverProvider = 'openai-tts', voiceoverVoice = 'coral', voiceoverOffsetSec = 0, durationMode = 'fixed', model = '', reasoningEffort = '', assets = [], composer, provider, autoReview = true, maxReviewerIterations } = normalized;
  if (!brief || typeof brief !== 'string') throw new Error('brief is required');
  if (!durationSec || durationSec < 1) throw new Error('durationSec must be positive');
  if (durationSec > config.maxDurationSec) throw new Error(`durationSec max ${config.maxDurationSec}`);
  if (!COMPOSERS.includes(composer)) throw new Error('invalid composer');
  if (composer === 'agent' && !PROVIDERS.includes(provider)) throw new Error('invalid provider');
  if (composer === 'agent' && !model) throw new Error('model is required for agent composer');
  if (!['fixed', 'voiceover'].includes(durationMode)) throw new Error('invalid durationMode');
  if (!Number.isFinite(Number(voiceoverOffsetSec)) || Math.abs(Number(voiceoverOffsetSec)) > 10) throw new Error('voiceoverOffsetSec must be between -10 and 10');
  const reviewerLimit = normalizeReviewerLimit(maxReviewerIterations);
  return { id: crypto.randomUUID().slice(0, 8), brief, durationSec, style, music, voiceover, voiceoverProvider, voiceoverVoice, voiceoverOffsetSec: Number(voiceoverOffsetSec), durationMode, composer, provider, agent: composer === 'template' ? 'none' : provider, model, reasoningEffort, assets, autoReview: autoReview !== false, maxReviewerIterations: reviewerLimit, effectiveSettings: normalizeGenerationSettings({ durationSec, style, music, voiceover, voiceoverProvider, voiceoverVoice, voiceoverOffsetSec, durationMode, composer, provider, model, reasoningEffort, assets }), workflow: createWorkflow({ music, voiceover, assets, urls: extractUrls(brief).length > 0, optimize: composer === 'agent' }), status: 'queued', stage: null, progress: 0, createdAt: Date.now(), startedAt: null, finishedAt: null, error: null, outputRel: null, wordBudget: wordBudget(durationSec) };
}
export function createRevision(parent, input = {}, revisionNumber = 1) {
  if (!parent || !parent.id) throw new Error('parent job is required');
  if (!['done', 'failed', 'cancelled'].includes(parent.status)) throw new Error('only completed jobs can be revised');
  if (!input.changeRequest || typeof input.changeRequest !== 'string' || !input.changeRequest.trim()) throw new Error('changeRequest is required');
  const settings = input.settings || input;
  const sourcePath = path.join(config.dataDir, 'jobs', parent.id, 'index.html');
  let sourceHtml = '';
  try { if (existsSync(sourcePath)) sourceHtml = readFileSync(sourcePath, 'utf8'); } catch { sourceHtml = ''; }
  const instruction = input.changeRequest || '';
  const rawTargets = input.revisionTargets || resolveRevisionTargets(instruction, sourceHtml, settings.durationSec || parent.durationSec);
  const mapped = (target, kind) => {
    if (sourceHtml.indexOf(`id="${target}"`) >= 0 || sourceHtml.indexOf(`class="${target}`) >= 0) return target;
    if (kind === 'header-logo') return sourceHtml.indexOf('class="brand-pill') >= 0 ? 'brand-pill' : sourceHtml.indexOf('class="brand-lockup') >= 0 ? 'brand-lockup' : target;
    if (kind === 'outro') return sourceHtml.indexOf('id="outro-lockup') >= 0 ? 'outro-lockup' : sourceHtml.indexOf('class="outro-center') >= 0 ? 'outro-center' : target;
    if (kind === 'operator-person') return sourceHtml.indexOf('class="operator-visual') >= 0 ? 'operator-visual panel' : sourceHtml.indexOf('class="person') >= 0 ? 'person' : target;
    return target;
  };
  const revisionTargets = rawTargets.map(target => ({ ...target, sourceId: mapped(target.sourceId, target.kind) }));
  const rawBindings = input.assetBindings || buildAssetBindings(settings.assets || parent.assets || [], revisionTargets);
  const assetBindings = rawBindings.map(binding => ({ ...binding, sourceId: mapped(binding.sourceId, binding.targetKind) }));
  const changeSet = input.changeSet || buildChangeSet(parent, instruction, settings);

  const sourceBrief = parent.originalBrief || parent.brief;
  const revisionBrief = `${sourceBrief}

REVISION REQUEST (apply only these changes; preserve everything else):
${input.changeRequest.trim()}`;
  const child = createJob({ ...changeSet.settingsDiff.after, brief: revisionBrief, autoReview: input.autoReview ?? parent.autoReview, maxReviewerIterations: input.maxReviewerIterations ?? parent.maxReviewerIterations });
  const stagePlan = input.stagePlan || planRevision(parent, changeSet);
  const promptProvenance = createPromptProvenance(parent, input.changeRequest.trim());
  return { ...child, parentJobId: parent.id, sourceJobId: parent.sourceJobId || parent.id, revisionNumber, originalBrief: sourceBrief, revisionReason: input.changeRequest.trim(), revisionInstruction: input.changeRequest.trim(), effectiveSettings: changeSet.settingsDiff.after, changeSet, stagePlan, changedFields: input.changedFields?.length ? input.changedFields : changeSet.factors.map(f => f.id), inheritedVoiceoverScript: parent.voiceoverScript || '', inheritedVoiceoverMeta: parent.voiceoverMeta || null, reuseVoiceoverFrom: stagePlan.nodes.find(n => n.id === 'voiceover')?.action === 'reuse' ? parent.id : '', reuseVideoFrom: stagePlan.nodes.find(n => n.id === 'render')?.action === 'reuse' ? parent.id : '', promptProvenance, revisionTargets, assetBindings, revisionContext: { sourceJobId: parent.id, instruction: input.changeRequest.trim(), factors: changeSet.factors, targets: revisionTargets, targetScenes: changeSet.factors.flatMap(f => f.targets || []).concat(revisionTargets.filter(t => Number.isFinite(t.scene)).map(t => t.scene)), parentAssetPaths: (parent.assets || []).map(asset => asset.path), preserve: changeSet.preserve, deterministic: revisionTargets.length > 0 || changeSet.factors.some(f => (f.targets || []).length > 0) } };
}

// A plain "do it again" — same brief, same settings, a brand-new job. Unlike
// createRevision, this deliberately does NOT set parentJobId: the composer
// treats a job with parentJobId as an edit of the existing source
// composition (preserve everything, patch only what the instruction names),
// which is the opposite of what a re-render needs after a prompt/composer
// fix — a full, independent recompose from the brief, so the corrected
// generation logic actually gets applied instead of patching the old
// (possibly buggy) output. sourceJobId still links it into the same
// version-history "room" in the UI.
export function createRerender(parent, revisionNumber = 1) {
  if (!parent || !parent.id) throw new Error('parent job is required');
  if (!['done', 'failed', 'cancelled'].includes(parent.status)) throw new Error('only completed jobs can be re-rendered');
  const settings = parent.effectiveSettings || parent;
  const child = createJob({ ...settings, brief: parent.brief, autoReview: parent.autoReview, maxReviewerIterations: parent.maxReviewerIterations });
  return { ...child, sourceJobId: parent.sourceJobId || parent.id, revisionNumber, originalBrief: parent.originalBrief || parent.brief, revisionReason: 'Re-rendered from the same brief and settings.' };
}

export { VALID_STATUSES };
