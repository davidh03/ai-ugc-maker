import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getJobsFile() {
  return process.env.JOBS_FILE || path.join(__dirname, '..', 'data', 'jobs.json');
}

export function loadJobs() {
  const f = getJobsFile();
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf8')); }
  catch { return []; }
}

export function saveJobs(jobs) {
  const f = getJobsFile();
  mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  writeFileSync(tmp, JSON.stringify(jobs, null, 2));
  renameSync(tmp, f);
}

export function upsertJob(job) {
  const jobs = loadJobs();
  const i = jobs.findIndex(j => j.id === job.id);
  if (i === -1) jobs.unshift(job); else jobs[i] = job;
  saveJobs(jobs);
}
