import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow, updateWorkflow } from './workflow.js';

describe('workflow', () => {
  it('starts with brief done and optional stages skipped when unused', () => { const flow = createWorkflow(); assert.equal(flow.find(n => n.id === 'brief').status, 'done'); assert.equal(flow.find(n => n.id === 'music').status, 'skipped'); });
  it('enables URL research only when references exist', () => { assert.equal(createWorkflow({ urls: false }).find(n => n.id === 'web-research').status, 'skipped'); assert.equal(createWorkflow({ urls: true }).find(n => n.id === 'web-research').enabled, true); });
  it('enables voiceover only when selected', () => { assert.equal(createWorkflow({ voiceover: false }).find(n => n.id === 'voiceover').status, 'skipped'); assert.equal(createWorkflow({ voiceover: true }).find(n => n.id === 'voiceover').enabled, true); });
  it('enables asset optimization only when an image asset is present, not for non-image assets', () => {
    assert.equal(createWorkflow({ assets: [] }).find(n => n.id === 'asset-optimization').status, 'skipped');
    assert.equal(createWorkflow({ assets: [{ category: 'music' }] }).find(n => n.id === 'asset-optimization').status, 'skipped');
    assert.equal(createWorkflow({ assets: [{ category: 'image' }] }).find(n => n.id === 'asset-optimization').enabled, true);
  });
  it('tracks the asset-optimization stage independently of asset-analysis', () => { let flow = createWorkflow({ assets: [{ category: 'image' }] }); flow = updateWorkflow(flow, 'asset-analysis', { status: 'running' }); flow = updateWorkflow(flow, 'asset-optimization', { status: 'running' }); assert.equal(flow.find(n => n.id === 'asset-analysis').status, 'done'); assert.equal(flow.find(n => n.id === 'asset-optimization').status, 'running'); });
  it('keeps Ready to review complete while the AI reviewer runs', () => { let flow = createWorkflow(); flow = updateWorkflow(flow, 'complete', { status: 'done' }); flow = updateWorkflow(flow, 'reviewing', { status: 'running' }); assert.equal(flow.find(n => n.id === 'complete').status, 'done'); assert.equal(flow.find(n => n.id === 'ai-reviewer').status, 'running'); });
  it('tracks the active stage and completes the previous node', () => { let flow = createWorkflow({ music: true }); flow = updateWorkflow(flow, 'composing', { status: 'running' }); assert.equal(flow.find(n => n.id === 'compose').status, 'running'); flow = updateWorkflow(flow, 'linting', { status: 'running' }); assert.equal(flow.find(n => n.id === 'compose').status, 'done'); assert.equal(flow.find(n => n.id === 'lint').status, 'running'); });
});

describe('reused workflow stages', () => { it('marks an inherited stage as reused', () => { const workflow = createWorkflow({ voiceover: true }); const next = updateWorkflow(workflow, 'voiceover', { status: 'reused' }); assert.equal(next.find(node => node.id === 'voiceover').status, 'reused'); }); });
