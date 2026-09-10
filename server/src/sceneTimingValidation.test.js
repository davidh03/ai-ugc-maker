import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractClipTimings, validateSceneTimings } from './sceneTimingValidation.js';

const html990ba173 = `
<section id="scene1" class="clip" data-start="0" data-duration="6" data-track-index="0">x</section>
<section id="scene2" class="clip" data-start="6" data-duration="8" data-track-index="0">x</section>
<section data-track-index="1" id="scene7" data-duration="6" class="clip" data-start="48">x</section>
`;

describe('extractClipTimings', () => {
  it('reads data-start/data-duration regardless of attribute order', () => {
    const clips = extractClipTimings(html990ba173);
    assert.deepEqual(clips.map(c => [c.id, c.startSec, c.durationSec]), [
      ['scene1', 0, 6],
      ['scene2', 6, 8],
      ['scene7', 48, 6],
    ]);
  });
  it('ignores clip elements missing a usable id or timing', () => {
    const clips = extractClipTimings('<div class="clip" data-start="0">no duration or id</div>');
    assert.equal(clips.length, 0);
  });
});

describe('validateSceneTimings', () => {
  it('passes when the render matches the required timings within tolerance', () => {
    const result = validateSceneTimings(html990ba173, [
      { id: 'scene1', startSec: 0, durationSec: 6 },
      { id: 'scene2', startSec: 6.1, durationSec: 7.9 },
    ]);
    assert.equal(result.passed, true);
    assert.deepEqual(result.mismatches, []);
  });
  it('flags a scene whose rendered cut drifted past tolerance from the real audio timing', () => {
    const result = validateSceneTimings(html990ba173, [{ id: 'scene2', startSec: 8.2, durationSec: 8 }]);
    assert.equal(result.passed, false);
    assert.equal(result.mismatches[0].id, 'scene2');
    assert.ok(result.mismatches[0].startDrift > 0.4);
  });
  it('flags a required scene that the composer dropped entirely', () => {
    const result = validateSceneTimings(html990ba173, [{ id: 'scene5', startSec: 34, durationSec: 2 }]);
    assert.equal(result.passed, false);
    assert.equal(result.mismatches[0].issue, 'missing-in-render');
  });
});
