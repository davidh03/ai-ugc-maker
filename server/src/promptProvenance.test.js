import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPromptProvenance, finalizePromptProvenance, resolveEffectivePrompt } from './promptProvenance.js';

describe('prompt provenance', () => {
  it('uses the parent revision prompt rather than the root brief', () => {
    const parent = { brief: 'root', promptProvenance: { effectiveRevisionPrompt: 'parent exact prompt' } };
    assert.equal(resolveEffectivePrompt(parent), 'parent exact prompt');
  });
  it('creates detached immutable snapshots', () => {
    const parent = { id: 'p1', brief: 'parent prompt' };
    const result = createPromptProvenance(parent, 'change one thing');
    parent.brief = 'mutated';
    assert.equal(result.parentPrompt, 'parent prompt');
    assert.equal(result.revisionInstruction, 'change one thing');
    assert.equal(result.effectiveRevisionPrompt, '');
  });
  it('falls back gracefully for a job with no promptProvenance at all (legacy/historical job)', () => {
    const legacyJob = { id: 'old-1', brief: 'a legacy brief with no provenance recorded' };
    assert.doesNotThrow(() => resolveEffectivePrompt(legacyJob));
    assert.equal(resolveEffectivePrompt(legacyJob), 'a legacy brief with no provenance recorded');
    assert.equal(legacyJob.promptProvenance, undefined);
  });
  it('finalize sets the exact effective prompt without touching the recorded parent prompt', () => {
    const created = createPromptProvenance({ id: 'p1', brief: 'parent prompt' }, 'make it punchier');
    const finalized = finalizePromptProvenance(created, 'FULL COMPOSER PROMPT: parent prompt ... make it punchier ...');
    assert.equal(finalized.parentPrompt, 'parent prompt');
    assert.equal(finalized.effectiveRevisionPrompt, 'FULL COMPOSER PROMPT: parent prompt ... make it punchier ...');
    assert.notEqual(finalized.sha256.effectiveRevisionPrompt, created.sha256.effectiveRevisionPrompt);
  });
});
