import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { analyzeAsset, isFractionalBox } from './assetAnalyzer.js';
const file = '/tmp/aiugc-analysis-test.ppm';

describe('asset analyzer', () => {
  it('extracts image dimensions and a suggested role', async () => { writeFileSync(file, 'P3\n4 2\n255\n' + '255 0 0 '.repeat(8)); const result = await analyzeAsset({ id: 'a', filename: 'product-hero.ppm', originalName: 'product-hero.ppm', category: 'image', path: 'aiugc-analysis-test.ppm', required: true }, '/tmp'); assert.equal(result.width, 4); assert.equal(result.height, 2); assert.equal(result.orientation, 'landscape'); assert.equal(result.suggestedRole, 'hero'); assert.equal(result.analysisMode, 'local-media-metadata'); unlinkSync(file); });
});

describe('isFractionalBox — guards a hallucinated cropBox before it reaches the cropper', () => {
  it('accepts a well-formed box within the frame', () => assert.equal(isFractionalBox({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }), true));
  it('accepts the full-frame box', () => assert.equal(isFractionalBox({ x: 0, y: 0, width: 1, height: 1 }), true));
  it('rejects a missing box', () => { assert.equal(isFractionalBox(null), false); assert.equal(isFractionalBox(undefined), false); });
  it('rejects non-numeric fields', () => assert.equal(isFractionalBox({ x: '0.1', y: 0, width: 0.5, height: 0.5 }), false));
  it('rejects a zero-area box', () => assert.equal(isFractionalBox({ x: 0, y: 0, width: 0, height: 0.5 }), false));
  it('rejects a negative origin', () => assert.equal(isFractionalBox({ x: -0.1, y: 0, width: 0.5, height: 0.5 }), false));
  it('rejects a box that runs off the right/bottom edge of the image', () => assert.equal(isFractionalBox({ x: 0.7, y: 0, width: 0.5, height: 0.5 }), false));
});
