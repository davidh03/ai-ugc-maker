import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createJob, createRevision } from './jobs.js';
import { buildChangeSet } from './revisionChangeSet.js';
import { planRevision } from './revisionPlanner.js';
import { resolveRevisionTargets } from './revisionTargetResolver.js';
import { buildAssetBindings } from './revisionAssetBindings.js';
import { loadJobs, upsertJob, deleteJob } from './store.js';
import { runJob, cancelJob } from './jobRunner.js';
import { providersRouter } from './routes/providers.js';
import { stop as stopCodex } from './providers/codexProvider.js';
import { getOpenCodeModels } from './providers/opencodeProvider.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (Number(process.versions.node.split('.')[0]) < 22 && !process.env.AIUGC_NODE22_REEXEC) {
  const candidates = [process.env.AIUGC_NODE_BIN, path.join(process.env.HOME || '', '.nvm/versions/node/v22.23.2/bin/node')].filter(Boolean);
  const node22 = candidates.find(candidate => existsSync(candidate));
  if (!node22) { console.error(`ai-ugc-maker requires Node.js >= 22 (current: ${process.version}). Run: nvm use 22.23.2`); process.exit(1); }
  const result = spawnSync(node22, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, AIUGC_NODE22_REEXEC: '1', PATH: `${path.dirname(node22)}:${process.env.PATH || ''}` } });
  process.exit(result.status ?? 1);
}

function loadEnv() {
  try {
    const lines = readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    const e = {};
    for (const l of lines) { const i = l.indexOf('='); if (i > 0) e[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
    return e;
  } catch { return {}; }
}
const env = loadEnv();
for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8787),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
};

const ASSETS_DIR = path.join(config.dataDir, 'assets');
mkdirSync(ASSETS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '50mb' }));

// Provider and model catalog routes
app.use('/api/providers', providersRouter);

app.get('/api/models', async (_req, res) => {
  try { res.json(await getOpenCodeModels()); }
  catch { res.json([{ id: 'opencode/mimo-v2.5-free', name: 'mimo-v2.5-free' }]); }
});

// Asset upload — multipart form data (no multer needed, raw body)
app.post('/api/assets', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  try {
    const filename = req.headers['x-filename'] || 'upload';
    const ASSET_CATEGORIES = ['image', 'video', 'music', 'other'];
    const requestedCategory = req.headers['x-category'] || 'other';
    const category = ASSET_CATEGORIES.includes(requestedCategory) ? requestedCategory : 'other';
    const required = String(req.headers['x-required'] ?? 'true').toLowerCase() !== 'false'; // default: REQUIRED
    const id = crypto.randomUUID().slice(0, 8);
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

app.post('/api/jobs/:id/revision-plan', (req, res) => {
  try {
    const parent = loadJobs().find(job => job.id === req.params.id);
    if (!parent) return res.status(404).json({ error: 'not found' });
    const instruction = req.body?.instruction || req.body?.changeRequest;
    const settings = req.body?.settings || {};
    const changeSet = buildChangeSet(parent, instruction, settings);
    const sourcePath = path.join(config.dataDir, 'jobs', parent.id, 'index.html');
    const sourceHtml = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
    const revisionTargets = resolveRevisionTargets(instruction, sourceHtml, settings.durationSec || parent.durationSec);
    const assetBindings = buildAssetBindings(changeSet.settingsDiff.after.assets, revisionTargets);
    const stagePlan = planRevision(parent, changeSet);
    const plan = { sourceJobId: parent.id, baselineVersion: parent.revisionNumber || 0, settingsDiff: changeSet.settingsDiff, changeSet, revisionTargets, assetBindings, stagePlan, planHash: Buffer.from(JSON.stringify({ parent: parent.id, instruction: instruction.trim(), settings: changeSet.settingsDiff.after })).toString('base64url') };
    res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/jobs/:id/revisions', (req, res) => {
  try {
    const jobs = loadJobs();
    const parent = jobs.find(job => job.id === req.params.id);
    if (!parent) return res.status(404).json({ error: 'not found' });
    const sourceJobId = parent.sourceJobId || parent.id;
    const revisionNumber = jobs.filter(job => (job.sourceJobId || job.id) === sourceJobId).reduce((max, job) => Math.max(max, Number(job.revisionNumber) || 0), 0) + 1;
    const settings = req.body?.settings || req.body;
    const sourcePath = path.join(config.dataDir, 'jobs', parent.id, 'index.html');
    const sourceHtml = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : '';
    const instruction = req.body?.changeRequest || req.body?.instruction;
    const revisionTargets = resolveRevisionTargets(instruction, sourceHtml, settings.durationSec || parent.durationSec);
    const assetBindings = buildAssetBindings(settings.assets || parent.assets || [], revisionTargets);
    const job = createRevision(parent, { ...req.body, settings, revisionTargets, assetBindings }, revisionNumber);
    upsertJob(job);
    runJob(job).catch(err => console.error('Revision render failed:', err));
    res.status(201).json(job);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

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

app.get('/api/jobs/:id/thumbnail', async (req, res) => {
  const job = loadJobs().find(j => j.id === req.params.id);
  if (!job || !job.outputRel) return res.status(404).json({ error: 'no output yet' });
  const file = path.join(config.dataDir, job.outputRel);
  const thumbnail = path.join(config.dataDir, 'jobs', job.id, 'thumbnail.jpg');
  if (!existsSync(file)) return res.status(404).json({ error: 'output file missing' });
  try {
    if (!existsSync(thumbnail)) await execFileP('ffmpeg', ['-y', '-ss', '0.5', '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', thumbnail]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(thumbnail);
  } catch (err) { res.status(500).json({ error: 'thumbnail generation failed', detail: String(err.message || err).slice(0, 160) }); }
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

app.delete('/api/jobs/:id', (req, res) => {
  try {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'not found' });
    if (['queued', 'running'].includes(job.status)) return res.status(400).json({ error: 'cannot delete an active generation; cancel it first' });
    const dependents = jobs.filter(j => j.parentJobId === job.id);
    if (dependents.length) return res.status(400).json({ error: `cannot delete: ${dependents.length} revision(s) depend on this version` });
    deleteJob(job.id);
    try { rmSync(path.join(config.dataDir, 'jobs', job.id), { recursive: true, force: true }); }
    catch (e) { console.warn('failed to remove job directory:', e.message); }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// SPA catch-all
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(distDir));
app.get('/{*splat}', (_req, res) => { res.sendFile(path.join(distDir, 'index.html')); });

const server = app.listen(config.port, config.host, () => { console.log('listening on ' + config.host + ':' + config.port); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await stopCodex(); server.close(() => process.exit(0)); });
