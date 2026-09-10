import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { optimizeAsset, optimizeAssets, applyOptimizedAssets } from './assetOptimizer.js';

const execFileP = promisify(execFile);

async function hasImageMagick() {
  try { await execFileP('convert', ['-version']); return true; } catch { return false; }
}

async function makeTestImage(dir, name, width = 400, height = 300) {
  const filePath = path.join(dir, name);
  await execFileP('convert', ['-size', `${width}x${height}`, 'xc:white', filePath]);
  return filePath;
}

describe('applyOptimizedAssets', () => {
  it('swaps in the cropped path for an optimized asset and keeps the original path as a reference', () => {
    const assets = [{ id: 'a1', path: 'assets/image/a1-shot.png', category: 'image' }, { id: 'a2', path: 'assets/image/a2-shot.png', category: 'image' }];
    const optimizations = [{ id: 'a1', optimized: true, path: 'jobs/job1/optimized-assets/a1-shot.png' }, { id: 'a2', optimized: false, reason: 'nothing meaningful to trim' }];
    const result = applyOptimizedAssets(assets, optimizations);
    assert.equal(result[0].path, 'jobs/job1/optimized-assets/a1-shot.png');
    assert.equal(result[0].originalPath, 'assets/image/a1-shot.png');
    assert.equal(result[1].path, 'assets/image/a2-shot.png');
    assert.equal(result[1].originalPath, undefined);
  });
  it('leaves assets untouched when there are no optimizations at all', () => {
    const assets = [{ id: 'a1', path: 'assets/image/a1-shot.png' }];
    assert.deepEqual(applyOptimizedAssets(assets, []), assets);
  });
});

describe('optimizeAsset — skip decisions (no real cropping needed to verify these)', () => {
  it('skips a non-image asset', async () => {
    const result = await optimizeAsset({ id: 'm1', category: 'music', path: 'assets/music/m1.mp3' }, { category: 'music' }, { dataDir: '/tmp', outputDir: '/tmp/job' });
    assert.equal(result.optimized, false);
    assert.match(result.reason, /not an image/);
  });
  it('skips a logo regardless of what cropBox the analysis returned', async () => {
    const result = await optimizeAsset({ id: 'l1', category: 'image', path: 'assets/image/l1-logo.png' }, { category: 'image', suggestedRole: 'logo', cropBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, width: 800, height: 800 }, { dataDir: '/tmp', outputDir: '/tmp/job' });
    assert.equal(result.optimized, false);
    assert.match(result.reason, /logo/);
  });
  it('skips when there is no crop box at all', async () => {
    const result = await optimizeAsset({ id: 's1', category: 'image', path: 'assets/image/s1-shot.png' }, { category: 'image', suggestedRole: 'supporting' }, { dataDir: '/tmp', outputDir: '/tmp/job' });
    assert.equal(result.optimized, false);
    assert.match(result.reason, /no crop box/);
  });
  it('skips when the crop box already covers nearly the whole image', async () => {
    const result = await optimizeAsset({ id: 's1', category: 'image', path: 'assets/image/s1-shot.png' }, { category: 'image', suggestedRole: 'supporting', cropBox: { x: 0, y: 0, width: 0.98, height: 1 }, width: 800, height: 600 }, { dataDir: '/tmp', outputDir: '/tmp/job' });
    assert.equal(result.optimized, false);
    assert.match(result.reason, /nearly the whole image/);
  });
});

describe('optimizeAsset — actual cropping (skipped if ImageMagick is unavailable)', () => {
  it('crops a screenshot down to its analyzed content box and leaves the original file untouched', async (t) => {
    if (!(await hasImageMagick())) { t.skip('ImageMagick not available in this environment'); return; }
    const dataDir = mkdtempSync(path.join(tmpdir(), 'aiugc-assetopt-'));
    const outputDir = path.join(dataDir, 'jobs', 'job1');
    const assetsDir = path.join(dataDir, 'assets', 'image');
    mkdirSync(assetsDir, { recursive: true });
    const sourcePath = await makeTestImage(assetsDir, 'shot.png', 1000, 800);
    const asset = { id: 'shot1', category: 'image', path: 'assets/image/shot.png', filename: 'shot.png' };
    const analysis = { category: 'image', suggestedRole: 'supporting', width: 1000, height: 800, cropBox: { x: 0.5, y: 0, width: 0.5, height: 1 } };
    const result = await optimizeAsset(asset, analysis, { dataDir, outputDir });
    assert.equal(result.optimized, true);
    assert.equal(result.width, 500);
    assert.equal(result.height, 800);
    const destPath = path.join(dataDir, result.path);
    assert.ok(existsSync(destPath), 'cropped file should exist');
    const { stdout } = await execFileP('identify', ['-format', '%wx%h', destPath]);
    assert.equal(stdout.trim(), '500x800');
    const { stdout: originalDims } = await execFileP('identify', ['-format', '%wx%h', sourcePath]);
    assert.equal(originalDims.trim(), '1000x800', 'original upload must be untouched');
  });
});

describe('optimizeAssets', () => {
  it('only processes image-category assets and matches each to its own analysis by id', async () => {
    const assets = [{ id: 'i1', category: 'image', path: 'assets/image/i1.png' }, { id: 'v1', category: 'video', path: 'assets/video/v1.mp4' }];
    const analyses = [{ id: 'i1', category: 'image', suggestedRole: 'logo' }, { id: 'v1', category: 'video' }];
    const results = await optimizeAssets(assets, analyses, { dataDir: '/tmp', outputDir: '/tmp/job' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'i1');
  });
});
