const VALID_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'];
const VALID_STAGES = ['composing', 'linting', 'rendering', 'encoding'];

const TRANSITIONS = {
  queued:  ['running', 'cancelled'],
  running: ['done', 'failed', 'cancelled'],
  done:    [],
  failed:  [],
  cancelled: [],
};

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(job, toStatus) {
  if (!VALID_STATUSES.includes(toStatus)) {
    throw new Error(`Invalid status: ${toStatus}`);
  }
  if (!canTransition(job.status, toStatus)) {
    throw new Error(`Cannot transition from ${job.status} to ${toStatus}`);
  }
  return true;
}

export function wordBudget(durationSec, wordsPerMinute = 150) {
  return Math.round(durationSec * wordsPerMinute / 60);
}

export function createJob({ brief, durationSec, style = 'product', music = false }) {
  if (!brief || typeof brief !== 'string') throw new Error('brief is required');
  if (!durationSec || typeof durationSec !== 'number' || durationSec < 1) {
    throw new Error('durationSec must be a positive number');
  }
  if (durationSec > 180) throw new Error('durationSec cannot exceed 180');

  const id = crypto.randomUUID().slice(0, 8);
  return {
    id,
    brief,
    durationSec,
    style,
    music,
    status: 'queued',
    stage: null,
    progress: 0,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    error: null,
    outputPath: null,
    outputRel: null,
    wordBudget: wordBudget(durationSec),
  };
}
