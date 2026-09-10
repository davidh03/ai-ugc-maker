import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, validateTransition, wordBudget, createJob, createRevision, createRerender, normalizeJobInput } from './jobs.js';
describe('canTransition', () => { it('queued -> running', () => assert.ok(canTransition('queued', 'running'))); it('queued -> cancelled', () => assert.ok(canTransition('queued', 'cancelled'))); it('queued -> done (illegal)', () => assert.ok(!canTransition('queued', 'done'))); it('running -> done', () => assert.ok(canTransition('running', 'done'))); it('running -> failed', () => assert.ok(canTransition('running', 'failed'))); it('done -> anything (illegal)', () => assert.ok(!canTransition('done', 'running'))); });
describe('validateTransition', () => { it('throws on illegal transition', () => assert.throws(() => validateTransition({ status: 'queued' }, 'done'), /Cannot transition/)); it('throws on invalid status', () => assert.throws(() => validateTransition({ status: 'queued' }, 'bogus'), /Invalid status/)); });
describe('wordBudget', () => { it('15s = 38 words', () => assert.equal(wordBudget(15), 38)); it('60s = 150 words', () => assert.equal(wordBudget(60), 150)); });
describe('createJob', () => { it('creates a template job', () => { const job = createJob({ brief: 'teaser', durationSec: 10, composer: 'template' }); assert.equal(job.status, 'queued'); assert.equal(job.composer, 'template'); }); it('creates an agent job with provider', () => { const job = createJob({ brief: 'x', durationSec: 10, composer: 'agent', provider: 'openai-codex', model: 'gpt-test' }); assert.equal(job.agent, 'openai-codex'); }); it('rejects missing brief', () => assert.throws(() => createJob({ durationSec: 10, composer: 'template' }))); it('rejects duration > 180', () => assert.throws(() => createJob({ brief: 'x', durationSec: 200, composer: 'template' }))); it('normalizes legacy none', () => assert.equal(normalizeJobInput({ agent: 'none' }).composer, 'template')); it('persists an explicit reviewer correction limit', () => { const job = createJob({ brief: 'x', durationSec: 15, composer: 'template', maxReviewerIterations: 0 }); assert.equal(job.maxReviewerIterations, 0); }); it('defaults durationMode to fixed', () => assert.equal(createJob({ brief: 'x', durationSec: 15, composer: 'template' }).durationMode, 'fixed')); it('accepts durationMode voiceover', () => { const job = createJob({ brief: 'x', durationSec: 15, composer: 'template', voiceover: true, durationMode: 'voiceover' }); assert.equal(job.durationMode, 'voiceover'); assert.equal(job.effectiveSettings.durationMode, 'voiceover'); }); it('rejects an invalid durationMode', () => assert.throws(() => createJob({ brief: 'x', durationSec: 15, composer: 'template', durationMode: 'bogus' }), /invalid durationMode/)); it('defaults voiceoverOffsetSec to 0', () => assert.equal(createJob({ brief: 'x', durationSec: 15, composer: 'template' }).voiceoverOffsetSec, 0)); it('accepts a signed voiceoverOffsetSec', () => { const job = createJob({ brief: 'x', durationSec: 15, composer: 'template', voiceover: true, voiceoverOffsetSec: -1.5 }); assert.equal(job.voiceoverOffsetSec, -1.5); assert.equal(job.effectiveSettings.voiceoverOffsetSec, -1.5); }); it('rejects an out-of-range voiceoverOffsetSec', () => assert.throws(() => createJob({ brief: 'x', durationSec: 15, composer: 'template', voiceoverOffsetSec: 20 }), /voiceoverOffsetSec/)); it('defaults autoReview to true when not specified', () => assert.equal(createJob({ brief: 'x', durationSec: 15, composer: 'template' }).autoReview, true)); it('honors an explicit autoReview: false so the post-render reviewer is skipped', () => assert.equal(createJob({ brief: 'x', durationSec: 15, composer: 'template', autoReview: false }).autoReview, false)); });

describe('createRevision', () => {
  it('creates an immutable child with inherited settings and a revision request', () => { const parent = { ...createJob({ brief: 'original brief', durationSec: 60, composer: 'agent', provider: 'openai-codex', model: 'gpt-test', assets: [{ id: 'asset-1' }] }), status: 'done', originalBrief: 'original brief', voiceover: true, voiceoverScript: 'Approved narration.', voiceoverMeta: { provider: 'test', script: 'Approved narration.' } }; const child = createRevision(parent, { changeRequest: 'Replace Scene 1 screenshot.', changedFields: ['assets'] }, 2); assert.equal(child.parentJobId, parent.id); assert.equal(child.sourceJobId, parent.id); assert.equal(child.revisionNumber, 2); assert.match(child.brief, /REVISION REQUEST/); assert.match(child.brief, /Replace Scene 1 screenshot/); assert.deepEqual(child.assets, parent.assets); assert.equal(child.durationSec, 60); assert.deepEqual(child.changedFields, ['assets']); assert.equal(child.reuseVoiceoverFrom, parent.id); });

  it('persists parent prompt and revision request as separate provenance fields, and does not mutate the parent', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 60, composer: 'agent', provider: 'openai-codex', model: 'gpt-test' }), status: 'done', originalBrief: 'original brief' };
    const parentSnapshot = JSON.parse(JSON.stringify(parent));
    const child = createRevision(parent, { changeRequest: 'Make the intro punchier.' }, 2);
    assert.equal(child.promptProvenance.parentPrompt, 'original brief');
    assert.equal(child.promptProvenance.revisionInstruction, 'Make the intro punchier.');
    assert.equal(child.promptProvenance.effectiveRevisionPrompt, '', 'effective prompt is not known until the composer actually runs');
    assert.notEqual(child.promptProvenance.parentPrompt, child.promptProvenance.revisionInstruction, 'parent prompt and revision request must stay distinct');
    assert.deepEqual(parent, parentSnapshot, 'createRevision must not mutate the parent job it reads from');
  });

  it('a revision that only changes voiceoverOffsetSec reuses the video and the voiceover audio — only the mix reruns', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template', voiceover: true }), status: 'done', originalBrief: 'original brief', voiceoverScript: 'Approved narration.', voiceoverMeta: { provider: 'openai-tts', script: 'Approved narration.' }, artifactManifest: { cleanVideo: { relPath: 'jobs/parent/clean-video.mp4' } } };
    const child = createRevision(parent, { changeRequest: 'Shift the audio bed a bit later.', settings: { voiceoverOffsetSec: 1.2 } }, 2);
    assert.equal(child.voiceoverOffsetSec, 1.2);
    assert.equal(child.reuseVideoFrom, parent.id, 'render must reuse the parent clean video, not recompose/re-render');
    assert.equal(child.reuseVoiceoverFrom, parent.id, 'voiceover audio must be reused, not re-synthesized');
    const musicNode = child.stagePlan.nodes.find(n => n.id === 'music');
    assert.equal(musicNode.action, 'rerun', 'only the audio mix should rerun to apply the new offset');
  });

  it('a revision can switch an existing job into voiceover-driven duration mode', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 60, composer: 'template', voiceover: false }), status: 'done', originalBrief: 'original brief' };
    assert.equal(parent.durationMode, 'fixed');
    const child = createRevision(parent, { changeRequest: 'Turn on voiceover and let it drive the length.', settings: { voiceover: true, durationMode: 'voiceover' } }, 2);
    assert.equal(child.durationMode, 'voiceover');
    assert.equal(child.voiceover, true);
  });

  it('non-revision jobs work without any prompt provenance field', () => {
    const job = createJob({ brief: 'a fresh brief', durationSec: 15, composer: 'template' });
    assert.equal(job.promptProvenance, undefined);
    assert.equal(job.status, 'queued');
  });
});

describe('createRerender', () => {
  it('creates a fresh job from the same brief and settings, grouped into the same room', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template', voiceover: true, voiceoverProvider: 'cartesia-tts' }), status: 'done' };
    const child = createRerender(parent, 2);
    assert.notEqual(child.id, parent.id);
    assert.equal(child.brief, parent.brief);
    assert.equal(child.durationSec, 20);
    assert.equal(child.voiceoverProvider, 'cartesia-tts');
    assert.equal(child.sourceJobId, parent.id);
    assert.equal(child.revisionNumber, 2);
  });
  it('does not set parentJobId, so the composer treats it as a fresh compose rather than an edit of the old (possibly buggy) source', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template' }), status: 'done' };
    const child = createRerender(parent, 2);
    assert.equal(child.parentJobId, undefined);
  });
  it('does not reuse the parent video or voiceover — it is a full fresh render', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template', voiceover: true }), status: 'done', voiceoverMeta: { provider: 'openai-tts' }, artifactManifest: { cleanVideo: { relPath: 'jobs/parent/clean-video.mp4' } } };
    const child = createRerender(parent, 2);
    assert.equal(child.reuseVideoFrom, undefined);
    assert.equal(child.reuseVoiceoverFrom, undefined);
  });
  it('groups a re-render of a revision into the same room as the rest of that family', () => {
    const root = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template' }), status: 'done' };
    const revision = { ...createRevision(root, { changeRequest: 'Make the intro punchier.' }, 2), status: 'done' };
    const child = createRerender(revision, 3);
    assert.equal(child.sourceJobId, root.id);
  });
  it('rejects re-rendering a job that is still in flight', () => {
    const parent = { ...createJob({ brief: 'original brief', durationSec: 20, composer: 'template' }), status: 'running' };
    assert.throws(() => createRerender(parent, 2), /only completed jobs/);
  });
});
