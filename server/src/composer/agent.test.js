import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOnce, agentComposer } from './agent.js';

describe('agent composer process watchdog', () => {
  it('returns after a stable composition even if the provider child hangs', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aiugc-agent-'));
    const code = "require('fs').writeFileSync('index.html', '<html>' + 'x'.repeat(2000) + '</html>'); setTimeout(() => {}, 30000)";
    const started = Date.now();
    const result = await runOnce(process.execPath, ['-e', code], dir, 'test');
    assert.equal(result, dir);
    assert.equal(existsSync(path.join(dir, 'index.html')), true);
    assert.ok(Date.now() - started < 10000);
    assert.match(await readFile(path.join(dir, 'index.html'), 'utf8'), /xxxx/);
  });
});

describe('agent composer deterministic revision — prompt provenance', () => {
  const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
  const cleanupDirs = [];
  after(async () => { await Promise.all(cleanupDirs.map(dir => rm(dir, { recursive: true, force: true }))); });

  it('persists the exact patch prompt actually applied, separate from the parent prompt — no provider is spawned', async () => {
    const parentId = 'test-parent-' + Date.now();
    const childId = 'test-child-' + Date.now();
    const parentDir = path.join(DATA_DIR, 'jobs', parentId);
    const childDir = path.join(DATA_DIR, 'jobs', childId);
    cleanupDirs.push(parentDir, childDir);
    await mkdir(parentDir, { recursive: true });
    const sourceHtml = '<div id="root"><div id="scene1"><img src="old.png"><p>Keep everything else</p></div></div>';
    await writeFile(path.join(parentDir, 'index.html'), sourceHtml);

    const job = {
      id: childId,
      parentJobId: parentId,
      composer: 'agent',
      provider: 'opencode',
      brief: 'irrelevant — deterministic patch bypasses the AI prompt',
      style: 'product',
      durationSec: 15,
      assets: [{ filename: 'new.png', path: 'assets/image/new.png' }],
      promptProvenance: { schemaVersion: 1, parentJobId: parentId, parentPrompt: 'ORIGINAL PARENT PROMPT TEXT', revisionInstruction: 'swap the screenshot in scene 1', effectiveRevisionPrompt: '' },
      revisionContext: {
        deterministic: true,
        instruction: 'swap the screenshot in scene 1',
        targetScenes: [1],
        factors: [{ id: 'asset.replace', targets: [1] }],
        parentAssetPaths: [],
      },
    };

    const resultDir = await agentComposer.compose(job);
    assert.equal(resultDir, childDir);

    // the persisted "revised prompt" must be the real applied patch, not the parent prompt or the raw brief
    assert.notEqual(job.promptProvenance.effectiveRevisionPrompt, '');
    assert.notEqual(job.promptProvenance.effectiveRevisionPrompt, job.promptProvenance.parentPrompt);
    assert.match(job.promptProvenance.effectiveRevisionPrompt, /DETERMINISTIC REVISION PATCH/);
    assert.match(job.promptProvenance.effectiveRevisionPrompt, /swap the screenshot in scene 1/);
    assert.equal(job.promptProvenance.parentPrompt, 'ORIGINAL PARENT PROMPT TEXT', 'parent prompt must stay untouched by finalization');

    // it's written to disk under the child job, not the parent
    const persistedPrompt = await readFile(path.join(childDir, 'prompt.txt'), 'utf8');
    assert.equal(persistedPrompt, job.promptProvenance.effectiveRevisionPrompt);
    assert.equal(existsSync(path.join(parentDir, 'prompt.txt')), false);
  });
});
