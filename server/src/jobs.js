import { createWorkflow } from './workflow.js';
import { extractUrls } from './webResearch.js';

const VALID_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];const TRANSITIONS = { queued: ['running', 'cancelled'], running: ['done', 'failed', 'cancelled'], done: [], failed: [], cancelled: [] };
export const COMPOSERS = ['template', 'agent'];
export const PROVIDERS = ['opencode', 'openai-codex'];
export function canTransition(from, to) { return TRANSITIONS[from]?.includes(to) ?? false; }
export function validateTransition(job, to) { if (!TRANSITIONS[to]) throw new Error(`Invalid status: ${to}`); if (!canTransition(job.status, to)) throw new Error(`Cannot transition from ${job.status} to ${to}`); return true; }
export function wordBudget(durationSec, wpm = 150) { return Math.round(durationSec * wpm / 60); }
export function normalizeJobInput(input = {}) { const composer = input.composer || (input.agent && input.agent !== 'none' ? 'agent' : 'template'); const provider = input.provider || (input.agent && input.agent !== 'none' ? input.agent : ''); return { ...input, composer, provider, agent: composer === 'template' ? 'none' : provider }; }
export function createJob(input) {
  const normalized = normalizeJobInput(input);
  const { brief, durationSec, style = 'product', music = false, voiceover = false, voiceoverProvider = 'openai-tts', model = '', reasoningEffort = '', assets = [], composer, provider } = normalized;
  if (!brief || typeof brief !== 'string') throw new Error('brief is required');
  if (!durationSec || durationSec < 1) throw new Error('durationSec must be positive');
  if (durationSec > 180) throw new Error('durationSec max 180');
  if (!COMPOSERS.includes(composer)) throw new Error('invalid composer');
  if (composer === 'agent' && !PROVIDERS.includes(provider)) throw new Error('invalid provider');
  if (composer === 'agent' && !model) throw new Error('model is required for agent composer');
  return { id: crypto.randomUUID().slice(0, 8), brief, durationSec, style, music, voiceover, voiceoverProvider, composer, provider, agent: composer === 'template' ? 'none' : provider, model, reasoningEffort, assets, workflow: createWorkflow({ music, voiceover, assets, urls: extractUrls(brief).length > 0 }), status: 'queued', stage: null, progress: 0, createdAt: Date.now(), startedAt: null, finishedAt: null, error: null, outputRel: null, wordBudget: wordBudget(durationSec) };
}
export { VALID_STATUSES };
