export const WORKFLOW_NODES = [
  { id: 'brief', label: 'Brief received', required: true },
  { id: 'web-research', label: 'Research URL references', required: false },
  { id: 'asset-analysis', label: 'Analyze assets', required: false },
  { id: 'compose', label: 'Compose timeline', required: true },
  { id: 'voiceover', label: 'Generate voiceover', required: false },
  { id: 'lint', label: 'Validate composition', required: true },
  { id: 'render', label: 'Render video', required: true },
  { id: 'music', label: 'Mix music bed', required: false },
  { id: 'complete', label: 'Ready to review', required: true },
];

export function createWorkflow({ music = false, voiceover = false, assets = [], urls = false } = {}) {
  return WORKFLOW_NODES.map((node, index) => {
    const enabled = node.required || (node.id === 'music' ? Boolean(music) : node.id === 'voiceover' ? Boolean(voiceover) : node.id === 'asset-analysis' ? assets.length > 0 : node.id === 'web-research' ? Boolean(urls) : true);
    return { ...node, order: index, enabled, status: enabled ? (index === 0 ? 'done' : 'pending') : 'skipped', startedAt: null, finishedAt: null, error: null };
  });
}

export function updateWorkflow(workflow = [], stage, patch = {}) {
  if (!Array.isArray(workflow)) return workflow;
  const stageToNode = { composing: 'compose', 'web-research': 'web-research', 'asset-analysis': 'asset-analysis', voiceover: 'voiceover', linting: 'lint', rendering: 'render', 'music-mix': 'music', complete: 'complete', brief: 'brief', compose: 'compose', lint: 'lint', render: 'render', music: 'music' };
  const nodeId = stageToNode[stage];
  if (!nodeId) return workflow;
  const index = workflow.findIndex(node => node.id === nodeId);
  if (index < 0) return workflow;
  const next = workflow.map(node => ({ ...node }));
  const previous = next.find(node => node.status === 'running' && node.id !== nodeId);
  if (previous) { previous.status = 'done'; previous.finishedAt = Date.now(); }
  if (patch.status === 'running') { next[index].status = 'running'; next[index].startedAt ||= Date.now(); }
  if (patch.status === 'done') { next[index].status = 'done'; next[index].finishedAt = Date.now(); }
  if (patch.status === 'failed') { next[index].status = 'failed'; next[index].error = patch.error || null; }
  return next;
}
