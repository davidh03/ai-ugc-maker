import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioConcatPlan } from './audioConcatPlan.js';

describe('audio concat plan', () => {
  it('adds one -i per real clip in order and maps a single concatenated output', () => {
    const plan = buildAudioConcatPlan([{ path: '/tmp/scene1.mp3' }, { path: '/tmp/scene2.mp3' }], '/tmp/out.mp3');
    assert.deepEqual(plan.args.filter((v, i) => plan.args[i - 1] === '-i'), ['/tmp/scene1.mp3', '/tmp/scene2.mp3']);
    assert.equal(plan.args.at(-1), '/tmp/out.mp3');
    assert.match(plan.args.join(' '), /concat=n=2:v=0:a=1\[out\]/);
  });
  it('generates true silence via anullsrc for a scene with no narration', () => {
    const plan = buildAudioConcatPlan([{ path: '/tmp/scene1.mp3' }, { silence: true, durationSec: 6 }], '/tmp/out.mp3');
    assert.match(plan.args.join(' '), /-f lavfi -t 6 -i anullsrc=r=44100:cl=stereo/);
    assert.match(plan.args.join(' '), /concat=n=2:v=0:a=1\[out\]/);
  });
  it('normalizes every input to a common sample rate and channel layout before concatenating', () => {
    const plan = buildAudioConcatPlan([{ path: '/tmp/a.mp3' }, { silence: true, durationSec: 2 }, { path: '/tmp/b.mp3' }], '/tmp/out.mp3');
    const filter = plan.args[plan.args.indexOf('-filter_complex') + 1];
    assert.match(filter, /\[0:a\]aformat=sample_rates=44100:channel_layouts=stereo\[a0\]/);
    assert.match(filter, /\[1:a\]aformat=sample_rates=44100:channel_layouts=stereo\[a1\]/);
    assert.match(filter, /\[2:a\]aformat=sample_rates=44100:channel_layouts=stereo\[a2\]/);
    assert.match(filter, /\[a0\]\[a1\]\[a2\]concat=n=3:v=0:a=1\[out\]/);
  });
  it('clamps a silence duration below the minimum instead of emitting an invalid -t', () => {
    const plan = buildAudioConcatPlan([{ silence: true, durationSec: 0 }], '/tmp/out.mp3');
    assert.match(plan.args.join(' '), /-t 0\.05 -i/);
  });
  it('throws on an empty segment list rather than building an unmappable filter', () => {
    assert.throws(() => buildAudioConcatPlan([], '/tmp/out.mp3'));
  });
  it('applies no tempo stage by default', () => {
    const plan = buildAudioConcatPlan([{ path: '/tmp/a.mp3' }], '/tmp/out.mp3');
    assert.equal(plan.args.join(' ').includes('atempo'), false);
  });
  it('chains a single atempo pass after concat when a soft-cap tempo is given', () => {
    const plan = buildAudioConcatPlan([{ path: '/tmp/a.mp3' }, { path: '/tmp/b.mp3' }], '/tmp/out.mp3', { tempo: 1.2 });
    const filter = plan.args[plan.args.indexOf('-filter_complex') + 1];
    assert.match(filter, /concat=n=2:v=0:a=1\[concatenated\];\[concatenated\]atempo=1\.2\[out\]/);
  });
  it('clamps an out-of-range tempo into atempo\'s valid [0.5, 2.0] band', () => {
    const tooFast = buildAudioConcatPlan([{ path: '/tmp/a.mp3' }], '/tmp/out.mp3', { tempo: 5 });
    assert.match(tooFast.args.join(' '), /atempo=2\b/);
    const tooSlow = buildAudioConcatPlan([{ path: '/tmp/a.mp3' }], '/tmp/out.mp3', { tempo: 0.1 });
    assert.match(tooSlow.args.join(' '), /atempo=0\.5\b/);
  });
});
