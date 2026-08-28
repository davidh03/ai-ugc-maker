import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadJobs, saveJobs, upsertJob } from './store.js';
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
});
