import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRevisionTargets } from './revisionTargetResolver.js';

const html = `<main>
<section id="opening" class="clip brand-header" data-start="0" data-duration="8"><div class="brand-lockup">Brand</div></section>
<section id="human-segment" class="clip" data-start="42" data-duration="12"><div class="operator-frame">A customer support operator</div></section>
<section id="closing-card" class="clip finale" data-name="outro" data-start="54" data-duration="6"><div class="logo-lockup">Brand</div></section>
</main>`;

describe('revision target resolver', () => {
  it('resolves semantic targets from source instead of fixed scene numbers', () => {
    const targets = resolveRevisionTargets('Use the real logo in the top left header and outro. Put the uploaded woman in the operator frame.', html, 60);
    assert.deepEqual(targets.map(t => t.kind).sort(), ['header-logo', 'operator-person', 'outro']);
    assert.equal(targets.find(t => t.kind === 'operator-person').sourceId, 'human-segment');
    assert.deepEqual(targets.find(t => t.kind === 'operator-person').timeRange, [42, 54]);
    assert.equal(targets.find(t => t.kind === 'outro').sourceId, 'closing-card');
    assert.deepEqual(targets.find(t => t.kind === 'outro').timeRange, [54, 60]);
  });
  it('resolves an explicit scene with hyphenated or unhyphenated IDs', () => {
    const source = '<div id="scene-3" class="clip" data-start="10" data-duration="5"></div>';
    assert.equal(resolveRevisionTargets('Change Scene 3 only.', source, 15)[0].sourceId, 'scene-3');
  });
});
