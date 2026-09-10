import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { patchComposition } from './compositionPatcher.js';

const source = '<div id="root"><div id="scene1"><p>Keep one</p></div><div id="scene2"><img src="old.png"><p>Change me</p></div><div id="scene3"><p>Keep three</p></div></div>';
const job = { assets: [{ filename: 'new.png', path: 'assets/image/new.png' }], revisionContext: { instruction: 'In Scene 2 replace the screenshot with the new asset.', targetScenes: [2], parentAssetPaths: ['assets/image/old.png'], factors: [{ id: 'asset.replace', targets: [2] }] } };

describe('composition patcher', () => {
  it('patches only the targeted scene asset', () => {
    const result = patchComposition(source, job);
    assert.equal(result.changed, true);
    assert.deepEqual(result.changes, ['Scene 2 asset']);
    assert.match(result.html, /assets\/new\.png/);
    assert.match(result.html, /Keep one/);
    assert.match(result.html, /Keep three/);
  });
  it('applies target-specific asset bindings without changing unrelated regions', () => {
    const boundSource = '<div id="root"><div id="header-brand"><span>Name</span></div><div id="content">Keep exactly</div><div id="person-frame"><div class="placeholder"></div></div><div id="ending"><img src="old-logo.png"></div></div>';
    const result = patchComposition(boundSource, { assets: [{ id:'logo', filename:'logo.png' }, { id:'person', filename:'person.png' }], assetBindings: [{ assetId:'logo', filename:'logo.png', targetKind:'header-logo', sourceId:'header-brand', required:true }, { assetId:'logo', filename:'logo.png', targetKind:'outro', sourceId:'ending', required:true }, { assetId:'person', filename:'person.png', targetKind:'operator-person', sourceId:'person-frame', required:true }], revisionContext: { instruction:'Use the real logo in the header and outro and the person in the operator frame.', targets:[{kind:'header-logo',sourceId:'header-brand'},{kind:'outro',sourceId:'ending'},{kind:'operator-person',sourceId:'person-frame'}] } });
    assert.equal(result.changed, true);
    assert.equal((result.html.match(/logo\.png/g) || []).length, 2);
    assert.match(result.html, /person\.png/);
    assert.match(result.html, /Keep exactly/);
  });
  it('refuses an unscoped edit instead of rebuilding source', () => {
    const result = patchComposition(source, { revisionContext: { instruction: 'Change the video', factors: [] } });
    assert.equal(result.changed, false);
    assert.equal(result.html, source);
  });
});
