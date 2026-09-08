import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePresentationScript } from './scriptParser.js';

const execFileP = promisify(execFile);
const BINARIES = { opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode', 'openai-codex': process.env.CODEX_BIN || '/home/clez/.local/bin/codex' };

export function buildOptimizerPrompt(job) {
  return `Rewrite the user's video prompt into a production-ready brief for an AI video composer. Preserve every explicit user requirement and factual claim. Add useful scene structure, pacing, visual direction, on-screen copy, transitions, brand consistency, and a natural narration plan only where the user has not already supplied them. If the input contains timecodes, Voiceover, Visual, On Screen, Company, or brand-color sections, preserve their meaning and do not rewrite approved voiceover wording. Never add wrapper labels, meta commentary, or instructions outside the optimized brief. Return only the optimized brief.\n\nUSER PROMPT:\n${job.brief}`;
}

export function shouldOptimize(job) {
  return job.composer === 'agent' && !parsePresentationScript(job.brief).detected;
}

export async function optimizePrompt(job, jobDir) {
  if (!shouldOptimize(job)) return { optimized: false, brief: job.brief, reason: 'structured-script-or-template' };
  const provider = job.provider || 'opencode'; const binary = BINARIES[provider];
  if (!binary) throw new Error(`Prompt optimizer does not support provider: ${provider}`);
  const outputPath = path.join(jobDir, 'optimized-brief.txt');
  const prompt = buildOptimizerPrompt(job); const model = job.model || (provider === 'opencode' ? 'opencode/mimo-v2.5-free' : undefined);
  const args = provider === 'opencode' ? ['run', `${prompt}\nWrite the final optimized brief to optimized-brief.txt in the working directory and do not modify any other file.`, '--model', model, '--dir', jobDir, '--pure', '--auto'] : ['exec', '--model', model, '--cd', jobDir, '--sandbox', 'workspace-write', '--skip-git-repo-check', '--ephemeral', '--color', 'never', `Write only the optimized brief to ${outputPath}. ${prompt}`];
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` };
  await execFileP(binary, args, { cwd: jobDir, env, timeout: 120000, maxBuffer: 1024 * 1024 });
  if (!existsSync(outputPath)) throw new Error('Prompt optimizer did not produce optimized-brief.txt');
  const brief = readFileSync(outputPath, 'utf8').trim();
  if (!brief) throw new Error('Prompt optimizer returned an empty brief');
  return { optimized: true, brief: brief.slice(0, 20000), provider, model: model || null };
}
