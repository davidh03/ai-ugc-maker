import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AGENT_COMMANDS = {
  opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode',
  claude: 'claude',
  codex: 'codex',
};

export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    const agentName = job.agent || 'opencode';
    const agentBin = AGENT_COMMANDS[agentName];
    if (!agentBin || !existsSync(agentBin)) {
      throw new Error(`Agent not found: ${agentName} (checked ${agentBin})`);
    }

    const prompt = `Create a HyperFrames composition HTML file at ${jobDir}/index.html.
Brief: ${job.brief}
Duration: ${job.durationSec}s
Style: ${job.style}
Music: ${job.music}

Requirements:
- Valid HyperFrames composition with data-composition-id, data-width, data-height attributes
- 1920x1080 viewport (or 1080x1920 for social style)
- data-track-index, data-start, data-duration on clip divs
- class="clip" on all timed elements
- window.__timelines registry
- Inline CSS only, no external deps
- Valid HTML5

Write ONLY the index.html file. Nothing else.`;

    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    return new Promise((resolve, reject) => {
      const child = spawn(agentBin, ['--prompt', prompt, '--auto'], {
        cwd: jobDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: `${process.env.HOME}/.opencode/bin:${process.env.PATH}` },
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);

      child.on('close', (code) => {
        if (code === 0 && existsSync(path.join(jobDir, 'index.html'))) {
          resolve(jobDir);
        } else {
          reject(new Error(`Agent ${agentName} exited ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', reject);
    });
  }
};
