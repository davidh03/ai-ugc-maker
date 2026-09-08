import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNarrationScript, narrationDirection } from '../narration.js';
import { narrationPlanPrompt } from '../scriptParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const AGENT_BINS = { opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode', 'openai-codex': process.env.CODEX_BIN || '/home/clez/.local/bin/codex', codex: process.env.CODEX_BIN || '/home/clez/.local/bin/codex' };

function loadEnv() { try { return Object.fromEntries(readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').map(line => { const i = line.indexOf('='); return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : null; }).filter(Boolean)); } catch { return {}; } }
const envVars = loadEnv();

function stageAssets(job, jobDir) {
  const assets = (job.assets || []).filter(asset => asset?.filename && asset.path);
  if (!assets.length) return [];
  const dir = path.join(jobDir, 'assets'); mkdirSync(dir, { recursive: true });
  return assets.flatMap(asset => { const source = path.join(DATA_DIR, asset.path); if (!existsSync(source)) return []; const destination = path.join(dir, asset.filename); try { copyFileSync(source, destination); return [{ filename: asset.filename, category: asset.category, rel: 'assets/' + asset.filename, required: asset.required !== false }]; } catch { return []; } });
}

function runOnce(binary, args, jobDir, model) {
  return new Promise((resolve, reject) => { const agentEnv = { ...process.env, PATH: `/home/clez/.local/bin:/home/clez/.opencode/bin:${process.env.PATH || ''}` }; if (model?.startsWith('opencode-go/') && envVars.OPENCODE_API_KEY) agentEnv.OPENCODE_API_KEY = envVars.OPENCODE_API_KEY; const child = spawn(binary, args, { cwd: jobDir, stdio: ['ignore', 'pipe', 'pipe'], env: agentEnv }); let stdout = '', stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; }); child.on('close', code => existsSync(path.join(jobDir, 'index.html')) ? resolve(jobDir) : reject({ code, output: (stderr || stdout).slice(0, 20000) })); child.on('error', reject); });
}

export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(DATA_DIR, 'jobs', job.id); mkdirSync(jobDir, { recursive: true }); const provider = job.provider || job.agent || 'opencode'; const binary = AGENT_BINS[provider]; if (!binary || (!existsSync(binary) && !binary.includes('/'))) throw new Error('Agent not found: ' + provider);
    const staged = stageAssets(job, jobDir); const dimensions = job.style === 'social' ? '1080x1920 vertical' : '1920x1080 landscape'; let prompt = `Create index.html from the complete user brief: ${job.brief}. ${job.durationSec}s ${job.style || 'product'} video in ${dimensions}. Preserve all user requirements, including titles, notes, camera directions, visual details, on-screen copy, and calls to action. Use GSAP animations. Include data-composition-id, data-width, data-height, class=clip, data-track-index, data-start, data-duration attributes on divs. Add window.__timelines. Create a natural voiceover script that matches the actual scene order and on-screen text, then embed it as window.__voiceoverScript = <JSON string>. Voiceover direction: ${narrationDirection(job.style)} Do not put URLs, research notes, production instructions, or visual descriptions into the spoken script.`;
    if (job.compositionBrief) prompt += ` PARSED COMPOSITION SUMMARY: ${job.compositionBrief}. The summary is supplemental; the complete user brief above is authoritative.`;
    if (job.narrationPlan?.detected) prompt += ` ${narrationPlanPrompt(job.narrationPlan)}`;
    if (job.assetManifest?.length) prompt += ` ASSET ANALYSIS MANIFEST (use actual media properties to decide asset roles, placement, and timing): ${JSON.stringify(job.assetManifest)}.`;
    if (staged.length) { const required = staged.filter(asset => asset.required), optional = staged.filter(asset => !asset.required); if (required.length) prompt += ` REQUIRED assets (must appear): ${required.map(asset => `${asset.rel} (${asset.category})`).join(', ')}.`; if (optional.length) prompt += ` OPTIONAL assets: ${optional.map(asset => `${asset.rel} (${asset.category})`).join(', ')}.`; prompt += ` Reference staged assets using relative paths such as <img src="${staged[0].rel}">.`; }
    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt); const model = job.model || (provider === 'opencode' ? 'opencode/mimo-v2.5-free' : undefined); const args = provider === 'opencode' ? ['run', prompt, '--model', model, '--dir', jobDir, '--pure', '--auto'] : ['exec', '--model', model, '--cd', jobDir, '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral', '--color', 'never', prompt]; const attempts = Number(process.env.AGENT_MAX_ATTEMPTS || 3); let last;
    for (let attempt = 1; attempt <= attempts; attempt++) { try { await runOnce(binary, args, jobDir, model || 'codex'); if (staged.length) { const html = readFileSync(path.join(jobDir, 'index.html'), 'utf8'); job.assetsUsed = staged.filter(asset => html.includes(asset.filename)).map(asset => asset.filename); job.requiredAssetsNotUsed = staged.filter(asset => asset.required && !html.includes(asset.filename)).map(asset => asset.filename); } return jobDir; } catch (error) { last = error; writeFileSync(path.join(jobDir, 'agent.log'), String(error.output || error.message || error).slice(0, 20000)); if (attempt < attempts && /UnknownError|Unexpected server error|overloaded/i.test(String(error.output || error))) await new Promise(resolve => setTimeout(resolve, attempt * 3000)); } }
    throw new Error(`Agent exited ${last?.code ?? 'unknown'}: ${String(last?.output || last?.message || last).slice(0, 300)} [attempts=${attempts}]`);
  }
};
