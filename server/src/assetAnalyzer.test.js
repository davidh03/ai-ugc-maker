import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { analyzeAsset } from './assetAnalyzer.js';
const file = '/tmp/aiugc-analysis-test.ppm';

describe('asset analyzer', () => {
  it('extracts image dimensions and a suggested role', async () => { writeFileSync(file, 'P3\n4 2\n255\n' + '255 0 0 '.repeat(8)); const result = await analyzeAsset({ id: 'a', filename: 'product-hero.ppm', originalName: 'product-hero.ppm', category: 'image', path: 'aiugc-analysis-test.ppm', required: true }, '/tmp'); assert.equal(result.width, 4); assert.equal(result.height, 2); assert.equal(result.orientation, 'landscape'); assert.equal(result.suggestedRole, 'hero'); assert.equal(result.analysisMode, 'local-media-metadata'); unlinkSync(file); });
});
