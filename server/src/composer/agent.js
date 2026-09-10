import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNarrationScript, narrationDirection } from '../narration.js';
import { narrationPlanPrompt } from '../scriptParser.js';
import { patchComposition } from '../compositionPatcher.js';
import { finalizePromptProvenance } from '../promptProvenance.js';

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

export function runOnce(binary, args, jobDir, model) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: jobDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `/home/clez/.local/bin:/home/clez/.opencode/bin:${process.env.PATH || ''}` } });
    let stdout = '', stderr = '', settled = false, stableChecks = 0, lastSize = -1;
    const outputPath = path.join(jobDir, 'index.html');
    const finish = (error, value) => { if (settled) return; settled = true; clearInterval(watchdog); clearTimeout(timeout); error ? reject(error) : resolve(value); };
    const watchdog = setInterval(() => {
      if (!existsSync(outputPath)) { stableChecks = 0; lastSize = -1; return; }
      try {
        const size = statSync(outputPath).size;
        if (size > 1000 && size === lastSize) stableChecks += 1;
        else stableChecks = 0;
        lastSize = size;
        // Codex sometimes leaves its child alive after writing the complete
        // composition. Three stable reads means the artifact is complete.
        if (stableChecks >= 3) { child.kill('SIGTERM'); finish(null, jobDir); }
      } catch { stableChecks = 0; }
    }, 1000);
    const timeout = setTimeout(() => { child.kill('SIGTERM'); finish({ code: 'COMPOSER_TIMEOUT', output: (stderr || stdout).slice(0, 20000) }); }, 600000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', code => existsSync(outputPath) ? finish(null, jobDir) : finish({ code, output: (stderr || stdout).slice(0, 20000) }));
    child.on('error', error => finish(error));
  });
}


export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(DATA_DIR, 'jobs', job.id); mkdirSync(jobDir, { recursive: true }); const provider = job.provider || job.agent || 'opencode'; const binary = AGENT_BINS[provider]; if (!binary || (!existsSync(binary) && !binary.includes('/'))) throw new Error('Agent not found: ' + provider);
    const staged = stageAssets(job, jobDir); const sourceCompositionPath = job.parentJobId ? path.join(DATA_DIR, "jobs", job.parentJobId, "index.html") : ""; const sourceCompositionAvailable = Boolean(sourceCompositionPath && existsSync(sourceCompositionPath)); if (sourceCompositionAvailable) { copyFileSync(sourceCompositionPath, path.join(jobDir, "source-index.html")); if (job.revisionContext && job.revisionContext.deterministic) { const patched = patchComposition(readFileSync(sourceCompositionPath, "utf8"), job); if (patched.changed) { const deterministicPrompt = `DETERMINISTIC REVISION PATCH\nInstruction: ${job.revisionContext.instruction || job.revisionInstruction || ""}\nTargets: ${JSON.stringify(job.revisionTargets || [])}\nAsset bindings: ${JSON.stringify(job.assetBindings || [])}\nOperations: ${JSON.stringify(patched.changes || [])}\nPreserve every unspecified source region.`; job.promptProvenance = finalizePromptProvenance(job.promptProvenance, deterministicPrompt); writeFileSync(path.join(jobDir, "prompt.txt"), deterministicPrompt); writeFileSync(path.join(jobDir, "index.html"), patched.html); job.revisionPatch = { applied: true, changes: patched.changes, reason: patched.reason }; return jobDir; } } } const dimensions = job.style === 'social' ? '1080x1920 vertical' : '1920x1080 landscape'; let prompt = `Create index.html from the complete user brief: ${job.brief}. The requested output duration is exactly ${job.durationSec} seconds; this setting is authoritative. If the brief contains longer timecodes or a longer stated duration, compress or retime every scene to fit exactly within ${job.durationSec} seconds and finish the end card inside that limit. ${job.durationSec}s ${job.style || 'product'} video in ${dimensions}. Preserve all user requirements, including titles, notes, camera directions, visual details, on-screen copy, and calls to action. Use GSAP animations. Include data-composition-id, data-width, data-height, class=clip, data-track-index, data-start, data-duration attributes on divs. Add window.__timelines. Create a natural voiceover script that matches the actual scene order and on-screen text, then embed it as window.__voiceoverScript = <JSON string>. Voiceover direction: ${narrationDirection(job.style)} Do not put URLs, research notes, production instructions, or visual descriptions into the spoken script.`;
    if (job.compositionBrief) prompt += ` PARSED COMPOSITION SUMMARY: ${job.compositionBrief}. The summary is supplemental; the complete user brief above is authoritative.`;
    if (job.narrationPlan?.detected) prompt += ` ${narrationPlanPrompt(job.narrationPlan)}`;
    if (job.voiceoverPreSynthesized && job.voiceoverScript) prompt += ` APPROVED VOICEOVER SCRIPT (already recorded at ${job.durationSec} seconds — do not rewrite, paraphrase, shorten, or extend it; embed it exactly as window.__voiceoverScript): ${JSON.stringify(job.voiceoverScript)}. This recording's real length is why ${job.durationSec} seconds is the authoritative output duration — pace the visual timeline to this narration's natural rhythm instead of writing new spoken lines.`;
    if (job.assetManifest?.length) prompt += ` ASSET ANALYSIS MANIFEST (use actual media properties to decide asset roles, placement, and timing): ${JSON.stringify(job.assetManifest)}.`; if (job.revisionTargets?.length) prompt += ` RESOLVED REVISION TARGETS: ${JSON.stringify(job.revisionTargets)}.`; if (job.assetBindings?.length) prompt += ` REQUIRED TARGET-SPECIFIC ASSET BINDINGS: ${JSON.stringify(job.assetBindings)}. Each filename must appear inside the corresponding sourceId subtree; using it elsewhere does not satisfy the requirement.`; if (job.parentJobId) prompt += ` REVISION MODE: This is an edit of the existing source composition. ${sourceCompositionAvailable ? 'Open source-index.html first and preserve its structure.' : 'The source composition file is unavailable; preserve all source requirements from the brief.'} Apply only the requested change. Target scenes: ${(job.revisionContext?.targetScenes || []).join(', ') || 'not explicitly identified'}. Do not regenerate, reorder, restyle, rename, or rewrite any non-target scene. Preserve all existing scene IDs, timecodes, durations, assets, narration, captions, branding, and outro unless the revision instruction explicitly targets them. Return a complete index.html, but keep every unspecified part byte-for-byte or semantically equivalent where possible.`;
    if (staged.length) { const required = staged.filter(asset => asset.required), optional = staged.filter(asset => !asset.required); if (required.length) prompt += ` REQUIRED assets (must appear): ${required.map(asset => `${asset.rel} (${asset.category})`).join(', ')}.`; if (optional.length) prompt += ` OPTIONAL assets: ${optional.map(asset => `${asset.rel} (${asset.category})`).join(', ')}.`; prompt += ` Reference staged assets using relative paths such as <img src="${staged[0].rel}">.`; }
    job.promptProvenance = finalizePromptProvenance(job.promptProvenance, prompt); writeFileSync(path.join(jobDir, 'prompt.txt'), prompt); const model = job.model || (provider === 'opencode' ? 'opencode/mimo-v2.5-free' : undefined); const args = provider === 'opencode' ? ['run', prompt, '--model', model, '--dir', jobDir, '--pure', '--auto'] : ['exec', '--model', model, '--cd', jobDir, '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '--color', 'never', prompt]; const attempts = Number(process.env.AGENT_MAX_ATTEMPTS || 3); let last;
    for (let attempt = 1; attempt <= attempts; attempt++) { try { await runOnce(binary, args, jobDir, model || 'codex'); if (staged.length) { const html = readFileSync(path.join(jobDir, 'index.html'), 'utf8'); job.assetsUsed = staged.filter(asset => html.includes(asset.filename)).map(asset => asset.filename); job.requiredAssetsNotUsed = staged.filter(asset => asset.required && !html.includes(asset.filename)).map(asset => asset.filename); } return jobDir; } catch (error) { last = error; const output = String(error.output || error.message || error); writeFileSync(path.join(jobDir, 'agent.log'), output.slice(0, 20000)); const retryable = /UnknownError|Unexpected server error|overloaded/i.test(output); if (!retryable) break; if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 3000)); } }
    throw new Error(`Agent exited ${last?.code ?? 'unknown'}: ${String(last?.output || last?.message || last).slice(0, 300)} [attempts=${attempts}]`);
  }
};
