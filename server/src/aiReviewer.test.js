import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { normalizeReview, regenerationScope, runReviewerLoop } from './aiReviewer.js';

describe('AI reviewer contract', () => {
  it('normalizes a passing review with no findings', () => {
    assert.deepEqual(normalizeReview({ satisfied: true, findings: [] }), { satisfied: true, findings: [], summary: '' });
  });

  it('rejects non-boolean satisfaction flags', () => {
    assert.throws(() => normalizeReview({ satisfied: 'false', findings: [] }), /boolean/);
  });

  it('does not replace an explicit zero correction limit with the default', async () => {
    let corrections = 0;
    const result = await runReviewerLoop({ maxIterations: 0, review: async () => ({ satisfied: false, findings: [{ category: 'visuals', severity: 'medium', issue: 'Needs work.' }] }), regenerate: async () => { corrections += 1; return { id: 'unexpected' }; } });
    assert.equal(corrections, 0);
    assert.equal(result.iterations, 0);
  });

  it('maps findings to granular regeneration scopes', () => {
    const review = normalizeReview({ satisfied: false, findings: [
      { category: 'voiceover', severity: 'high', issue: 'Narration starts before Scene 2.' },
      { category: 'assets', severity: 'high', issue: 'Operator image is missing.' },
      { category: 'timeline', severity: 'medium', issue: 'Scene 4 ends early.' },
    ] });
    assert.deepEqual(regenerationScope(review.findings), ['voiceover', 'assets', 'timeline']);
  });

  it('regenerates only until the reviewer is satisfied', async () => {
    const reviews = [
      { satisfied: false, findings: [{ category: 'assets', severity: 'high', issue: 'Missing operator image.' }] },
      { satisfied: true, findings: [] },
    ];
    const corrections = [];
    const result = await runReviewerLoop({
      maxIterations: 3,
      review: async () => reviews.shift(),
      regenerate: async request => { corrections.push(request); return { id: 'revision-2' }; },
    });
    assert.equal(result.satisfied, true);
    assert.equal(result.iterations, 1);
    assert.deepEqual(corrections, [{ iteration: 1, scope: ['assets'], findings: [{ category: 'assets', severity: 'high', issue: 'Missing operator image.' }], candidate: null }]);
  });

  it('runs the reviewer loop against a real 5-second video fixture', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ai-reviewer-5s-'));
    const video = path.join(dir, 'output.mp4');
    const corrected = path.join(dir, 'corrected.mp4');
    try {
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x3551F2:s=320x180:r=24', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video], { stdio: 'ignore' });
      let attempts = 0;
      const result = await runReviewerLoop({
        maxIterations: 3,
        initialCandidate: { outputPath: video },
        review: async candidate => {
          const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', candidate.outputPath], { encoding: 'utf8' }).trim());
          assert.ok(Math.abs(seconds - 5) < 0.1);
          attempts += 1;
          return attempts === 1 ? { satisfied: false, findings: [{ category: 'timeline', severity: 'medium', issue: 'Fixture needs a timing correction.' }] } : { satisfied: true, findings: [] };
        },
        regenerate: async request => { assert.deepEqual(request.scope, ['timeline']); execFileSync('ffmpeg', ['-y', '-i', video, '-vf', 'drawbox=x=0:y=0:w=20:h=20:color=white:t=fill', '-c:v', 'libx264', '-c:a', 'copy', corrected], { stdio: 'ignore' }); return { outputPath: corrected }; },
      });
      assert.equal(result.satisfied, true);
      assert.equal(result.iterations, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('stops after the configured correction limit', async () => {
    let reviews = 0;
    const corrections = [];
    const result = await runReviewerLoop({
      maxIterations: 3,
      review: async () => { reviews += 1; return { satisfied: false, findings: [{ category: 'visuals', severity: 'medium', issue: 'Too fast.' }] }; },
      regenerate: async request => { corrections.push(request); return { id: `revision-${corrections.length + 1}` }; },
    });
    assert.equal(result.satisfied, false);
    assert.equal(result.iterations, 3);
    assert.equal(reviews, 4);
    assert.equal(corrections.length, 3);
  });
});
