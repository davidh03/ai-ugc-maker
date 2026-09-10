import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkflow } from './workflow.js';
import { extractUrls } from './webResearch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function migrateWorkflow(job) {
  if (!Array.isArray(job?.workflow)) return job;
  const expected = createWorkflow({ music: job.music, voiceover: job.voiceover, assets: job.assets || [], urls: extractUrls(job.brief || '').length > 0, optimize: job.composer === 'agent' });
  if (job.workflow.length === expected.length && expected.every(node => job.workflow.some(existing => existing.id === node.id))) return job;
  const old = new Map(job.workflow.map(node => [node.id, node]));
  return { ...job, workflow: expected.map(node => {
    const existing = old.get(node.id);
    if (existing) return { ...node, ...existing, order: node.order };
    return node;
  }) };
}

function getJobsFile() {
  return process.env.JOBS_FILE || path.join(__dirname, '..', 'data', 'jobs.json');
}

export function loadJobs() {
  const f = getJobsFile();
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf8')).map(migrateWorkflow); }
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

export function deleteJob(id) {
  const jobs = loadJobs();
  const next = jobs.filter(j => j.id !== id);
  if (next.length === jobs.length) return false;
  saveJobs(next);
  return true;
}
