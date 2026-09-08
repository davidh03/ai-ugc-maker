import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOptimizerPrompt, shouldOptimize } from './promptOptimizer.js';

describe('prompt optimizer', () => {
  it('optimizes rough agent prompts', () => { assert.equal(shouldOptimize({ composer: 'agent', brief: 'Make a video about Cadre Crew.' }), true); assert.match(buildOptimizerPrompt({ brief: 'Make a video about Cadre Crew.' }), /production-ready brief/i); });
  it('preserves structured scripts', () => { assert.equal(shouldOptimize({ composer: 'agent', brief: 'Cold Open\nTimecode: 0:00 – 0:08\n\nVoiceover:\nHello.' }), false); });
  it('does not optimize template jobs', () => { assert.equal(shouldOptimize({ composer: 'template', brief: 'Make a video.' }), false); });
});
