import { presets } from '../templates/presets.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNarrationScript } from '../narration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const templateComposer = {
  async compose(job) {
    const preset = presets[job.style] || presets.product;
    const durationSec = job.durationSec || preset.durationSec;

    // Word budget enforcement
    const maxWords = Math.round(durationSec * 150 / 60);
    const sourceBrief = job.compositionBrief || job.brief;
    const words = sourceBrief.split(/\s+/).length;
    const brief = words > maxWords
      ? sourceBrief.split(/\s+/).slice(0, maxWords).join(' ')
      : sourceBrief;

    const html = preset.html(brief, durationSec);
    job.voiceoverScript = buildNarrationScript({ brief, style: job.style, durationSec });

    // Write to job workspace
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });
    const compositionPath = path.join(jobDir, 'index.html');
    writeFileSync(compositionPath, html);

    return jobDir;
  }
};
