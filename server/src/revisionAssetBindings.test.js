import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetBindings, validateAssetBindings } from './revisionAssetBindings.js';

const assets = [
  { id: 'brand', filename: 'company-logo.png', category: 'image', suggestedRole: 'logo' },
  { id: 'person', filename: 'support-agent.png', category: 'image', suggestedRole: 'person' }
];
const targets = [
  { id: 'target-header', kind: 'header-logo', sourceId: 'opening' },
  { id: 'target-outro', kind: 'outro', sourceId: 'closing-card' },
  { id: 'target-person', kind: 'operator-person', sourceId: 'human-segment' }
];

describe('revision asset bindings', () => {
  it('binds assets by role to every requested target', () => {
    const bindings = buildAssetBindings(assets, targets);
    assert.deepEqual(bindings.map(b => [b.assetId, b.targetKind]), [['brand','header-logo'],['brand','outro'],['person','operator-person']]);
  });
  it('does not count an asset outside its requested target subtree', () => {
    const html = '<div id="opening"><img src="company-logo.png"></div><div id="closing-card"></div>';
    const result = validateAssetBindings(html, [{ assetId:'brand', filename:'company-logo.png', targetKind:'outro', sourceId:'closing-card', required:true }]);
    assert.equal(result.passed, false);
  });
  it('handles sourceIds containing regex-special characters without throwing or mismatching', () => {
    const html = '<div id="scene(1)[outro]"><img src="company-logo.png"></div>';
    const result = validateAssetBindings(html, [{ assetId: 'brand', filename: 'company-logo.png', targetKind: 'outro', sourceId: 'scene(1)[outro]', required: true }]);
    assert.equal(result.passed, true);
  });
});
