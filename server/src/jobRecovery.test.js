import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadJobs, saveJobs } from './store.js';
import { reconcileOrphanedJobs, markRunningJobsInterrupted, activeJobIds } from './jobRunner.js';

const TEST_DIR = path.join(import.meta.dirname, '..', 'data', '_test_recovery');
const TEST_JOBS = path.join(TEST_DIR, 'jobs.json');

describe('job recovery', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.JOBS_FILE = TEST_JOBS;
    writeFileSync(TEST_JOBS, '[]');
    activeJobIds.clear();
  });
  afterEach(() => {
    delete process.env.JOBS_FILE;
    rmSync(TEST_DIR, { recursive: true, force: true });
    activeJobIds.clear();
  });

  describe('reconcileOrphanedJobs', () => {
    it('marks a job left running by a previous process as failed and recoverable', () => {
      saveJobs([{ id: 'a', status: 'running' }, { id: 'b', status: 'done' }]);
      const orphanedIds = reconcileOrphanedJobs();
      assert.deepEqual(orphanedIds, ['a']);
      const jobs = loadJobs();
      assert.equal(jobs.find(j => j.id === 'a').status, 'failed');
      assert.equal(jobs.find(j => j.id === 'a').recoverable, true);
      assert.match(jobs.find(j => j.id === 'a').error, /restart/);
      assert.equal(jobs.find(j => j.id === 'b').status, 'done', 'finished jobs are left untouched');
    });

    it('cancels an orphaned in-progress reviewer pass without touching a satisfied one', () => {
      saveJobs([
        { id: 'a', status: 'done', reviewerStatus: 'running' },
        { id: 'b', status: 'done', reviewerStatus: 'satisfied' },
      ]);
      reconcileOrphanedJobs();
      const jobs = loadJobs();
      assert.equal(jobs.find(j => j.id === 'a').reviewerStatus, 'cancelled');
      assert.equal(jobs.find(j => j.id === 'b').reviewerStatus, 'satisfied');
    });

    it('is a no-op when nothing was left running', () => {
      saveJobs([{ id: 'a', status: 'done' }, { id: 'b', status: 'failed' }]);
      assert.deepEqual(reconcileOrphanedJobs(), []);
    });
  });

  describe('markRunningJobsInterrupted', () => {
    it('marks only the jobs this process was actively driving', () => {
      saveJobs([{ id: 'a', status: 'running' }, { id: 'b', status: 'running' }]);
      activeJobIds.add('a');
      const interrupted = markRunningJobsInterrupted();
      assert.deepEqual(interrupted, ['a']);
      const jobs = loadJobs();
      assert.equal(jobs.find(j => j.id === 'a').status, 'failed');
      assert.equal(jobs.find(j => j.id === 'a').recoverable, true);
      assert.equal(jobs.find(j => j.id === 'b').status, 'running', 'a job this process was not driving is left for reconcileOrphanedJobs instead');
    });
  });
});
