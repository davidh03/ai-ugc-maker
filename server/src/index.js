import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createJob } from './jobs.js';
import { loadJobs, upsertJob } from './store.js';
import { runJob, cancelJob } from './jobRunner.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
};

const app = express();
app.use(express.json());

// Models endpoint
app.get('/api/models', async (_req, res) => {
  try {
    const { stdout } = await execFileP('/home/clez/.opencode/bin/opencode', ['models'], {
      env: { ...process.env, PATH: '/home/clez/.opencode/bin:' + process.env.PATH },
    });
    const models = stdout.trim().split('\n').filter(Boolean).map(m => ({
      id: m, name: m.split('/').pop(),
    }));
    res.json(models);
  } catch (err) {
    res.json([{ id: 'opencode/mimo-v2.5-free', name: 'mimo-v2.5-free' }]);
  }
});

// Jobs routes
app.post('/api/jobs', (req, res) => {
  try {
    const job = createJob(req.body);
    upsertJob(job);
    runJob(job).catch(err => console.error('Render failed:', err));
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jobs', (_req, res) => { res.json(loadJobs()); });

app.get('/api/jobs/:id', (req, res) => {
  const job = loadJobs().find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

app.get('/api/jobs/:id/output', (req, res) => {
  const job = loadJobs().find(j => j.id === req.params.id);
  if (!job || !job.outputRel) return res.status(404).json({ error: 'no output yet' });
  res.sendFile(path.join(config.dataDir, job.outputRel));
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!['queued', 'running'].includes(job.status)) {
    return res.status(400).json({ error: 'cannot cancel a terminal job' });
  }
  cancelJob(job.id);
  job.status = 'cancelled';
  job.finishedAt = Date.now();
  upsertJob(job);
  res.json(job);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// SPA catch-all
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(distDir));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(config.port, config.host, () => {
  console.log('listening on ' + config.host + ':' + config.port);
});
