import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    // Write the prompt for the agent
    const prompt = `Create a HyperFrames composition HTML file at ${jobDir}/index.html.
Brief: ${job.brief}
Duration: ${job.durationSec}s
Style: ${job.style}
Music: ${job.music}

The HTML must be a valid HyperFrames composition with:
- data-track-index, data-start, data-duration attributes on slide divs
- 1920x1080 viewport
- No external dependencies (inline CSS only)
- Valid HTML5

Write only the HTML file.`;

    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    return new Promise((resolve, reject) => {
      const child = spawn(config.agentCmd, [prompt], {
        cwd: jobDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stdout += d);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(jobDir);
        } else {
          reject(new Error(`Agent exited with code ${code}: ${stdout}`));
        }
      });

      child.on('error', reject);
    });
  }
};
