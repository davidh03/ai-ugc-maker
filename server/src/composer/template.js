import { presets } from '../templates/presets.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const templateComposer = {
  async compose(job) {
    const preset = presets[job.style] || presets.product;
    const durationSec = job.durationSec || preset.durationSec;

    // Word budget enforcement
    const maxWords = Math.round(durationSec * 150 / 60);
    const words = job.brief.split(/\s+/).length;
    const brief = words > maxWords
      ? job.brief.split(/\s+/).slice(0, maxWords).join(' ')
      : job.brief;

    const html = preset.html(brief, durationSec);

    // Write to job workspace
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });
    const compositionPath = path.join(jobDir, 'index.html');
    writeFileSync(compositionPath, html);

    return jobDir;
  }
};
