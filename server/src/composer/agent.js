import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const [key, ...val] = line.split('=');
    if (key && val.length) env[key.trim()] = val.join('=').trim();
  }
  return env;
}

const envVars = loadEnv();

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
      throw new Error('Agent not found: ' + agentName + ' (checked ' + agentBin + ')');
    }

    const prompt = 'Create a HyperFrames composition HTML file at ' + jobDir + '/index.html.\n' +
      'Brief: ' + job.brief + '\n' +
      'Duration: ' + job.durationSec + 's\n' +
      'Style: ' + job.style + '\n' +
      'Music: ' + job.music + '\n\n' +
      'Requirements:\n' +
      '- Valid HyperFrames composition with data-composition-id, data-width, data-height attributes\n' +
      '- 1920x1080 viewport (or 1080x1920 for social style)\n' +
      '- data-track-index, data-start, data-duration on clip divs\n' +
      '- class="clip" on all timed elements\n' +
      '- window.__timelines registry\n' +
      '- Inline CSS only, no external deps\n' +
      '- Valid HTML5\n\n' +
      'Write ONLY the index.html file. Nothing else.';

    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    return new Promise((resolve, reject) => {
      const agentEnv = {
        ...process.env,
        PATH: (process.env.HOME || '/home/clez') + '/.opencode/bin:' + process.env.PATH,
      };
      if (envVars.OPENCODE_API_KEY) {
        agentEnv.OPENCODE_API_KEY = envVars.OPENCODE_API_KEY;
      }

      const child = spawn(agentBin, ['--prompt', prompt, '--auto', '--model', job.model || 'opencode/mimo-v2.5-free'], {
        cwd: jobDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: agentEnv,
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);

      child.on('close', (code) => {
        if (code === 0 && existsSync(path.join(jobDir, 'index.html'))) {
          resolve(jobDir);
        } else {
          reject(new Error('Agent ' + agentName + ' exited ' + code + ': ' + (stderr || stdout)));
        }
      });

      child.on('error', reject);
    });
  }
};
