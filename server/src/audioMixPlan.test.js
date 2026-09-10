import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioMixPlan } from './audioMixPlan.js';

describe('audio mix plan', () => {
  it('pads short voiceover and keeps requested video duration authoritative', () => {
    const plan = buildAudioMixPlan({ voiceover: true, music: false, durationSec: 60 });
    assert.equal(plan.args.includes('-shortest'), false);
    assert.ok(plan.args.join(' ').includes('apad'));
    assert.deepEqual(plan.args.slice(-2), ['-t', '60']);
  });
  it('limits uploaded music to requested duration without shortest-stream truncation', () => {
    const plan = buildAudioMixPlan({ voiceover: false, music: true, uploadedMusic: true, durationSec: 30 });
    assert.equal(plan.args.includes('-shortest'), false);
    assert.deepEqual(plan.args.slice(-2), ['-t', '30']);
  });
  it('has no offset filter when voiceoverOffsetSec is 0 or omitted', () => {
    const plan = buildAudioMixPlan({ voiceover: true, durationSec: 20 });
    assert.equal(plan.args.join(' ').includes('adelay'), false);
    assert.equal(plan.args.join(' ').includes('atrim'), false);
  });
  it('delays the voice track for a positive offset (voice comes in late)', () => {
    const plan = buildAudioMixPlan({ voiceover: true, durationSec: 20, voiceoverOffsetSec: 1.5 });
    assert.match(plan.args.join(' '), /adelay=delays=1500:all=1,apad/);
  });
  it('trims the start of the voice track for a negative offset (voice comes in early)', () => {
    const plan = buildAudioMixPlan({ voiceover: true, durationSec: 20, voiceoverOffsetSec: -0.8 });
    assert.match(plan.args.join(' '), /atrim=start=0\.8,asetpts=PTS-STARTPTS,apad/);
  });
  it('applies the offset to the voice track even when music is also mixed', () => {
    const plan = buildAudioMixPlan({ voiceover: true, music: true, durationSec: 20, voiceoverOffsetSec: 2 });
    assert.match(plan.args.join(' '), /\[2:a\]adelay=delays=2000:all=1,apad/);
  });
});
