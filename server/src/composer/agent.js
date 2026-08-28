import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

const envVars = loadEnv();

const AGENT_BINS = {
  opencode: process.env.OPENCODE_BIN || '/home/clez/.opencode/bin/opencode',
  claude: 'claude',
  codex: 'codex',
};

export const agentComposer = {
  async compose(job) {
    const jobDir = path.join(__dirname, '..', '..', 'data', 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    const agentName = job.agent || 'opencode';
    const agentBin = AGENT_BINS[agentName];
    if (!agentBin || !existsSync(agentBin)) {
      throw new Error('Agent not found: ' + agentName);
    }

    const prompt = 'Write a HyperFrames video composition to ' + jobDir + '/index.html.\n' +
      'Brief: ' + job.brief + '\n' +
      'Duration: ' + job.durationSec + 's\n' +
      'Style: ' + job.style + '\n\n' +
      'Requirements: valid HyperFrames HTML with data-composition-id, data-width=1920, data-height=1080, ' +
      'class=clip on timed divs, data-track-index/data-start/data-duration, window.__timelines, inline CSS only. ' +
      'Write the file directly.';

    writeFileSync(path.join(jobDir, 'prompt.txt'), prompt);

    const args = agentName === 'opencode'
      ? ['run', prompt, '--model', job.model || 'opencode/mimo-v2.5-free']
      : [prompt];

    return new Promise((resolve, reject) => {
      const agentEnv = {
        ...process.env,
        PATH: (process.env.HOME || '/home/clez') + '/.opencode/bin:' + process.env.PATH,
      };
      if (envVars.OPENCODE_API_KEY) agentEnv.OPENCODE_API_KEY = envVars.OPENCODE_API_KEY;

      const child = spawn(agentBin, args, {
        cwd: jobDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: agentEnv,
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);

      child.on('close', (code) => {
        if (existsSync(path.join(jobDir, 'index.html'))) {
          resolve(jobDir);
        } else {
          reject(new Error('Agent ' + agentName + ' exited ' + code + ': ' + (stderr || stdout).slice(0, 500)));
        }
      });

      child.on('error', reject);
    });
  }
};
