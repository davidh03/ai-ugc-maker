import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOptimizerPrompt, ensureJobDir, shouldOptimize } from './promptOptimizer.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('prompt optimizer', () => {
  it('optimizes rough agent prompts', () => { assert.equal(shouldOptimize({ composer: 'agent', brief: 'Make a video about Cadre Crew.' }), true); assert.match(buildOptimizerPrompt({ brief: 'Make a video about Cadre Crew.', durationSec: 10 }), /production-ready brief/i); });
  it('keeps the selected duration authoritative when the prompt is longer', () => { const prompt = buildOptimizerPrompt({ brief: 'Create a 45-second video with scenes from 0:00 to 0:45.', durationSec: 10 }); assert.match(prompt, /selected output duration is authoritative: 10 seconds/i); assert.match(prompt, /compress or retime/i); });
  it('preserves structured scripts', () => { assert.equal(shouldOptimize({ composer: 'agent', brief: 'Cold Open\nTimecode: 0:00 – 0:08\n\nVoiceover:\nHello.' }), false); });
  it('does not optimize template jobs', () => { assert.equal(shouldOptimize({ composer: 'template', brief: 'Make a video.' }), false); });
  it('creates the optimizer working directory before spawning the provider', () => { const root = mkdtempSync(path.join(os.tmpdir(), 'aiugc-optimizer-')); const dir = path.join(root, 'jobs', 'test-id'); try { assert.equal(ensureJobDir(dir), dir); assert.equal(existsSync(dir), true); } finally { rmSync(root, { recursive: true, force: true }); } });
});
