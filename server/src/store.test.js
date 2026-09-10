import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadJobs, saveJobs, upsertJob, deleteJob } from './store.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const TEST_DIR = path.join(import.meta.dirname, '..', 'data', '_test');
const TEST_JOBS = path.join(TEST_DIR, 'jobs.json');

describe('store', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.JOBS_FILE = TEST_JOBS;
    // Start with empty file
    writeFileSync(TEST_JOBS, '[]');
  });
  afterEach(() => {
    delete process.env.JOBS_FILE;
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('loadJobs returns [] when no file', () => {
    rmSync(TEST_JOBS, { force: true });
    assert.deepEqual(loadJobs(), []);
  });

  it('fails closed when the jobs file is corrupt', () => {
    writeFileSync(TEST_JOBS, '{not-json');
    assert.throws(() => loadJobs(), /corrupt|invalid/i);
    assert.equal(existsSync(TEST_JOBS + '.corrupt'), true);
  });

  it('saveJobs + loadJobs round-trips', () => {
    const jobs = [{ id: 'a', status: 'queued' }];
    saveJobs(jobs);
    assert.deepEqual(loadJobs(), jobs);
  });

  it('upsertJob adds new', () => {
    upsertJob({ id: 'x', status: 'queued' });
    assert.equal(loadJobs().length, 1);
  });

  it('upsertJob updates existing', () => {
    upsertJob({ id: 'x', status: 'queued' });
    upsertJob({ id: 'x', status: 'running' });
    assert.equal(loadJobs()[0].status, 'running');
  });

  it('deleteJob removes the matching job and returns true', () => {
    upsertJob({ id: 'x', status: 'done' });
    upsertJob({ id: 'y', status: 'done' });
    const removed = deleteJob('x');
    assert.equal(removed, true);
    assert.deepEqual(loadJobs().map(j => j.id), ['y']);
  });

  it('deleteJob returns false and leaves the file unchanged when the id is unknown', () => {
    upsertJob({ id: 'x', status: 'done' });
    const removed = deleteJob('missing');
    assert.equal(removed, false);
    assert.deepEqual(loadJobs().map(j => j.id), ['x']);
  });

  it('migrates older URL jobs to show the research node without claiming it ran', () => {
    saveJobs([{ id: 'legacy', brief: 'Use https://example.com', music: false, assets: [], workflow: [{ id: 'brief', status: 'done' }, { id: 'compose', status: 'done' }] }]);
    const research = loadJobs()[0].workflow.find(node => node.id === 'web-research');
    assert.equal(research.enabled, true); assert.equal(research.status, 'pending');
  });
});
