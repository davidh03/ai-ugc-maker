import { createHash } from 'node:crypto';
function hash(value) { return createHash('sha256').update(String(value || '')).digest('hex'); }
export function resolveEffectivePrompt(job = {}) { return job.promptProvenance?.effectiveRevisionPrompt || job.promptProvenance?.parentPrompt || job.originalBrief || job.brief || ''; }
export function createPromptProvenance(parent = {}, revisionInstruction = '') { const parentPrompt = String(resolveEffectivePrompt(parent)); return { schemaVersion: 1, parentJobId: parent.id || '', parentPrompt, revisionInstruction: String(revisionInstruction), effectiveRevisionPrompt: '', createdAt: Date.now(), sha256: { parentPrompt: hash(parentPrompt), effectiveRevisionPrompt: '' } }; }
export function finalizePromptProvenance(current = {}, effectiveRevisionPrompt = '') { const prompt = String(effectiveRevisionPrompt); return { ...current, effectiveRevisionPrompt: prompt, sha256: { ...(current.sha256 || {}), effectiveRevisionPrompt: hash(prompt) } }; }
