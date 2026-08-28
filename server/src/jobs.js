const VALID_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];
const TRANSITIONS = { queued: ['running', 'cancelled'], running: ['done', 'failed', 'cancelled'], done: [], failed: [], cancelled: [] };

export function canTransition(from, to) { return TRANSITIONS[from]?.includes(to) ?? false; }
export function wordBudget(durationSec, wpm = 150) { return Math.round(durationSec * wpm / 60); }

export function createJob({ brief, durationSec, style = 'product', music = false, agent = 'none', model = '', assets = [] }) {
  if (!brief || typeof brief !== 'string') throw new Error('brief is required');
  if (!durationSec || durationSec < 1) throw new Error('durationSec must be positive');
  if (durationSec > 180) throw new Error('durationSec max 180');
  return {
    id: crypto.randomUUID().slice(0, 8),
    brief, durationSec, style, music, agent, model, assets,
    status: 'queued', stage: null, progress: 0,
    createdAt: Date.now(), startedAt: null, finishedAt: null,
    error: null, outputRel: null, wordBudget: wordBudget(durationSec),
  };
}
