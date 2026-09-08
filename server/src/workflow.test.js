import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow, updateWorkflow } from './workflow.js';

describe('workflow', () => {
  it('starts with brief done and optional stages skipped when unused', () => { const flow = createWorkflow(); assert.equal(flow.find(n => n.id === 'brief').status, 'done'); assert.equal(flow.find(n => n.id === 'music').status, 'skipped'); });
  it('enables URL research only when references exist', () => { assert.equal(createWorkflow({ urls: false }).find(n => n.id === 'web-research').status, 'skipped'); assert.equal(createWorkflow({ urls: true }).find(n => n.id === 'web-research').enabled, true); });
  it('enables voiceover only when selected', () => { assert.equal(createWorkflow({ voiceover: false }).find(n => n.id === 'voiceover').status, 'skipped'); assert.equal(createWorkflow({ voiceover: true }).find(n => n.id === 'voiceover').enabled, true); });
  it('tracks the active stage and completes the previous node', () => { let flow = createWorkflow({ music: true }); flow = updateWorkflow(flow, 'composing', { status: 'running' }); assert.equal(flow.find(n => n.id === 'compose').status, 'running'); flow = updateWorkflow(flow, 'linting', { status: 'running' }); assert.equal(flow.find(n => n.id === 'compose').status, 'done'); assert.equal(flow.find(n => n.id === 'lint').status, 'running'); });
});
