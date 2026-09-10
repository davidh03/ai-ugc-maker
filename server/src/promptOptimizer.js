import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePresentationScript } from './scriptParser.js';

const BINARIES = { opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode', 'openai-codex': process.env.CODEX_BIN || '/home/clez/.local/bin/codex' };

export function buildOptimizerPrompt(job) {
  return `Rewrite the user's video prompt into a production-ready brief for an AI video composer. Preserve every explicit user requirement and factual claim. Add useful scene structure, pacing, visual direction, on-screen copy, transitions, brand consistency, and a natural narration plan only where the user has not already supplied them. If the input contains timecodes, Voiceover, Visual, On Screen, Company, or brand-color sections, preserve their meaning and do not rewrite approved voiceover wording. The selected output duration is authoritative: ${job.durationSec || 'the selected'} seconds. Never extend the video to match a longer duration mentioned in the prompt. If supplied timecodes exceed the selected duration, compress or retime all beats proportionally so the final end card finishes within ${job.durationSec || 'the selected'} seconds. Never add wrapper labels, meta commentary, or instructions outside the optimized brief. Return only the optimized brief.\n\nUSER PROMPT:\n${job.brief}`;
}

export function shouldOptimize(job) {
  return job.composer === 'agent' && !parsePresentationScript(job.brief).detected;
}

export function ensureJobDir(jobDir) { mkdirSync(jobDir, { recursive: true }); return jobDir; }

function runProvider(binary, args, jobDir, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: jobDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Prompt optimizer timed out')); }, 120000);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error((stderr || stdout || `provider exited ${code}`).slice(0, 20000))); });
  });
}

export async function optimizePrompt(job, jobDir) {
  if (!shouldOptimize(job)) return { optimized: false, brief: job.brief, reason: 'structured-script-or-template' };
  const provider = job.provider || 'opencode'; const binary = BINARIES[provider];
  if (!binary) throw new Error(`Prompt optimizer does not support provider: ${provider}`);
  ensureJobDir(jobDir);
  const outputPath = path.join(jobDir, 'optimized-brief.txt');
  const prompt = buildOptimizerPrompt(job); const model = job.model || (provider === 'opencode' ? 'opencode/mimo-v2.5-free' : undefined);
  const args = provider === 'opencode' ? ['run', `${prompt}\nWrite the final optimized brief to optimized-brief.txt in the working directory and do not modify any other file.`, '--model', model, '--dir', jobDir, '--pure', '--auto'] : ['exec', '--model', model, '--cd', jobDir, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '--color', 'never', `Write only the optimized brief to ${outputPath}. ${prompt}`];
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` };
  await runProvider(binary, args, jobDir, env);
  if (!existsSync(outputPath)) throw new Error('Prompt optimizer did not produce optimized-brief.txt');
  const brief = readFileSync(outputPath, 'utf8').trim();
  if (!brief) throw new Error('Prompt optimizer returned an empty brief');
  return { optimized: true, brief: brief.slice(0, 20000), provider, model: model || null };
}
