import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createJob } from './jobs.js';
import { loadJobs, upsertJob } from './store.js';
import { runJob, cancelJob } from './jobRunner.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const lines = readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    const e = {};
    for (const l of lines) { const i = l.indexOf('='); if (i > 0) e[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
    return e;
  } catch { return {}; }
}
const env = loadEnv();

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
};

const ASSETS_DIR = path.join(config.dataDir, 'assets');
mkdirSync(ASSETS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '50mb' }));

// Models endpoint
app.get('/api/models', async (_req, res) => {
  try {
    // NOTE: do NOT inject OPENCODE_API_KEY here. That key is the paid
    // opencode-go subscription (currently dead) and makes the list show
    // paid models that 500 on use. Without it, `opencode models` returns
    // only what this machine can actually reach (free Zen models, or paid
    // Zen models once the user runs the opencode TUI and /connect's their
    // Zen key into auth.json).
    const { stdout } = await execFileP('/home/clez/.opencode/bin/opencode', ['models'], {
      env: { ...process.env, PATH: '/home/clez/.opencode/bin:' + process.env.PATH },
    });
    const models = stdout.trim().split('\n').filter(Boolean).map(m => ({ id: m, name: m.split('/').pop() }));
    res.json(models);
  } catch { res.json([{ id: 'opencode/mimo-v2.5-free', name: 'mimo-v2.5-free' }]); }
});

// Asset upload — multipart form data (no multer needed, raw body)
app.post('/api/assets', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const filename = req.headers['x-filename'] || 'upload';
    const category = req.headers['x-category'] || 'other'; // image, video, music, other
    const required = String(req.headers['x-required'] ?? 'true').toLowerCase() !== 'false'; // default: REQUIRED
    const id = crypto.randomUUID().slice(0, 8);
    const ext = path.extname(filename);
    const safeName = `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const assetDir = path.join(ASSETS_DIR, category);
    mkdirSync(assetDir, { recursive: true });
    const filePath = path.join(assetDir, safeName);
    writeFileSync(filePath, req.body);
    const asset = {
      id,
      filename: safeName,
      originalName: filename,
      category,
      required,
      size: req.body.length,
      path: `assets/${category}/${safeName}`,
      uploadedAt: Date.now(),
    };
    res.status(201).json(asset);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// List assets
app.get('/api/assets', (_req, res) => {
  const assets = [];
  for (const cat of ['image', 'video', 'music', 'other']) {
    const dir = path.join(ASSETS_DIR, cat);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const fp = path.join(dir, f);
      const stat = statSync(fp);
      assets.push({ filename: f, category: cat, size: stat.size, path: `assets/${cat}/${f}` });
    }
  }
  res.json(assets);
});

// Serve assets
app.use('/api/assets/files', express.static(ASSETS_DIR));

// Serve asset files from data dir
app.use('/assets', express.static(ASSETS_DIR));

// Jobs routes
app.post('/api/jobs', (req, res) => {
  try {
    const job = createJob(req.body);
    upsertJob(job);
    runJob(job).catch(err => console.error('Render failed:', err));
    res.status(201).json(job);
  } catch (err) { res.status(400).json({ error: err.message }); }
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
  const file = path.join(config.dataDir, job.outputRel);
  if (!existsSync(file)) return res.status(404).json({ error: 'output file missing' });
  if (req.query.download) {
    res.setHeader('Content-Disposition', 'attachment; filename="' + job.id + '.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
  }
  res.sendFile(file);
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!['queued', 'running'].includes(job.status)) return res.status(400).json({ error: 'cannot cancel' });
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
app.get('/{*splat}', (_req, res) => { res.sendFile(path.join(distDir, 'index.html')); });

app.listen(config.port, config.host, () => { console.log('listening on ' + config.host + ':' + config.port); });
