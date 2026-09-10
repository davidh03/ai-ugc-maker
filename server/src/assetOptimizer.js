import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const execFileP = promisify(execFile);
const CONVERT_BIN = process.env.IMAGEMAGICK_CONVERT_BIN || 'convert';
// A crop box covering nearly the whole image has nothing meaningful to
// trim — skip it rather than writing a near-identical derived file.
const FULL_FRAME_COVERAGE = 0.92;
const MIN_CROP_PX = 20;

// Never crop a logo/brand asset regardless of what the vision model
// returned — several briefs explicitly forbid cropping/distorting the
// attached logo, and a bad crop there is much more visible than a
// screenshot that just didn't get tightened.
function shouldSkip(asset, analysis) {
  if (!analysis || asset?.category !== 'image') return 'not an image asset';
  if (analysis.suggestedRole === 'logo') return 'logo/brand assets are never cropped';
  const box = analysis.cropBox;
  if (!box) return 'no crop box from analysis';
  if (box.width >= FULL_FRAME_COVERAGE && box.height >= FULL_FRAME_COVERAGE) return 'crop box covers nearly the whole image already';
  if (!analysis.width || !analysis.height) return 'source dimensions unknown';
  return null;
}

function pixelBox(analysis) {
  const { cropBox, width, height } = analysis;
  const x = Math.max(0, Math.min(width - 1, Math.round(cropBox.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(cropBox.y * height)));
  const w = Math.max(0, Math.min(width - x, Math.round(cropBox.width * width)));
  const h = Math.max(0, Math.min(height - y, Math.round(cropBox.height * height)));
  return { x, y, w, h };
}

// Crops one image asset to its analyzed content box, writing a new derived
// file — the original upload (shared across every job that references it)
// is never touched. Best-effort: any failure just means the original keeps
// being used downstream, not a job failure.
export async function optimizeAsset(asset, analysis, { dataDir, outputDir }) {
  const skipReason = shouldSkip(asset, analysis);
  if (skipReason) return { id: asset.id, optimized: false, reason: skipReason };
  const sourcePath = path.join(dataDir, asset.path);
  if (!existsSync(sourcePath)) return { id: asset.id, optimized: false, reason: 'source file missing' };
  const { x, y, w, h } = pixelBox(analysis);
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return { id: asset.id, optimized: false, reason: 'crop box too small to be meaningful' };
  const destDir = path.join(outputDir, 'optimized-assets');
  const destPath = path.join(destDir, asset.filename);
  try {
    mkdirSync(destDir, { recursive: true });
    await execFileP(CONVERT_BIN, [sourcePath, '-crop', `${w}x${h}+${x}+${y}`, '+repage', destPath]);
    return { id: asset.id, optimized: true, path: path.relative(dataDir, destPath), width: w, height: h, cropBox: analysis.cropBox };
  } catch (error) {
    return { id: asset.id, optimized: false, reason: String(error.message || error).slice(0, 240) };
  }
}

export async function optimizeAssets(assets = [], analyses = [], context) {
  const byId = new Map(analyses.map(a => [a.id, a]));
  return Promise.all(assets.filter(asset => asset?.category === 'image').map(asset => optimizeAsset(asset, byId.get(asset.id), context)));
}

// Applies successful optimizations back onto the job's own asset list —
// only the file path changes (to the derived, cropped file); id/category/
// required/etc. stay the same, so nothing downstream needs to know
// optimization happened at all.
export function applyOptimizedAssets(assets = [], optimizations = []) {
  const byId = new Map(optimizations.filter(o => o.optimized).map(o => [o.id, o]));
  return assets.map(asset => {
    const optimized = byId.get(asset.id);
    return optimized ? { ...asset, path: optimized.path, originalPath: asset.path } : asset;
  });
}
