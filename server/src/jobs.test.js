import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, validateTransition, wordBudget, createJob } from './jobs.js';

describe('canTransition', () => {
  it('queued -> running', () => assert.ok(canTransition('queued', 'running')));
  it('queued -> cancelled', () => assert.ok(canTransition('queued', 'cancelled')));
  it('queued -> done (illegal)', () => assert.ok(!canTransition('queued', 'done')));
  it('running -> done', () => assert.ok(canTransition('running', 'done')));
  it('running -> failed', () => assert.ok(canTransition('running', 'failed')));
  it('done -> anything (illegal)', () => assert.ok(!canTransition('done', 'running')));
});

describe('validateTransition', () => {
  it('throws on illegal transition', () => {
    const job = { status: 'queued' };
    assert.throws(() => validateTransition(job, 'done'), /Cannot transition/);
  });
  it('throws on invalid status', () => {
    const job = { status: 'queued' };
    assert.throws(() => validateTransition(job, 'bogus'), /Invalid status/);
  });
});

describe('wordBudget', () => {
  it('15s = 37 words', () => assert.equal(wordBudget(15), 38));
  it('60s = 150 words', () => assert.equal(wordBudget(60), 150));
});

describe('createJob', () => {
  it('creates a valid queued job', () => {
    const job = createJob({ brief: 'teaser', durationSec: 10 });
    assert.equal(job.status, 'queued');
    assert.equal(job.brief, 'teaser');
    assert.equal(job.durationSec, 10);
    assert.equal(job.wordBudget, 25);
    assert.ok(job.id.length === 8);
  });
  it('rejects missing brief', () => assert.throws(() => createJob({ durationSec: 10 })));
  it('rejects duration > 180', () => assert.throws(() => createJob({ brief: 'x', durationSec: 200 })));
});
