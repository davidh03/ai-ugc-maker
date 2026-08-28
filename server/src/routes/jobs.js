import { Router } from 'express';
import { createJob } from '../jobs.js';
import { loadJobs, upsertJob } from '../store.js';

export const jobsRouter = Router();

jobsRouter.post('/', (req, res) => {
  try {
    const job = createJob(req.body);
    upsertJob(job);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

jobsRouter.get('/', (_req, res) => {
  res.json(loadJobs());
});

jobsRouter.get('/:id', (req, res) => {
  const job = loadJobs().find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

jobsRouter.get('/:id/output', (req, res) => {
  res.status(404).json({ error: 'no output yet' });
});

jobsRouter.post('/:id/cancel', (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!['queued', 'running'].includes(job.status)) {
    return res.status(400).json({ error: 'cannot cancel a terminal job' });
  }
  job.status = 'cancelled';
  job.finishedAt = Date.now();
  upsertJob(job);
  res.json(job);
});
