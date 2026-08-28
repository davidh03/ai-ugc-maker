import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJob } from './jobs.js';
import { loadJobs, upsertJob } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
};

const app = express();
app.use(express.json());

app.post('/api/jobs', (req, res) => {
  try {
    const job = createJob(req.body);
    upsertJob(job);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jobs', (_req, res) => {
  res.json(loadJobs());
});

app.get('/api/jobs/:id', (req, res) => {
  const job = loadJobs().find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, config.host, () => {
  console.log('listening on ' + config.host + ':' + config.port);
});
