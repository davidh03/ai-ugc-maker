import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSoftCapTempo } from './voiceoverTempo.js';

describe('resolveSoftCapTempo', () => {
  it('leaves narration alone when there is no target duration', () => {
    assert.equal(resolveSoftCapTempo(70, null), 1);
    assert.equal(resolveSoftCapTempo(70, 0), 1);
    assert.equal(resolveSoftCapTempo(70, undefined), 1);
  });
  it('leaves narration alone when it runs under the target', () => {
    assert.equal(resolveSoftCapTempo(50, 60), 1);
  });
  it('leaves narration alone within the tolerance band (up to 15% over by default)', () => {
    assert.equal(resolveSoftCapTempo(60, 60), 1);
    assert.equal(resolveSoftCapTempo(69, 60), 1); // exactly 15% over
  });
  it('speeds up proportionally once past tolerance, to land back near the target', () => {
    // 66/60 = 1.1 -> within default 1.15 tolerance, so untouched
    assert.equal(resolveSoftCapTempo(66, 60), 1);
    // 75/60 = 1.25 -> past tolerance, and exactly at the default max, so used as-is
    assert.equal(resolveSoftCapTempo(75, 60), 1.25);
  });
  it('caps the tempo so speech never sounds unnatural, even for a huge overrun', () => {
    assert.equal(resolveSoftCapTempo(180, 60), 1.25); // 3x over -> still capped at 1.25
  });
  it('honors custom tolerance/max overrides', () => {
    assert.equal(resolveSoftCapTempo(66, 60, { toleranceRatio: 1.05 }), 1.1);
    assert.equal(resolveSoftCapTempo(180, 60, { maxTempo: 1.5 }), 1.5);
  });
});
