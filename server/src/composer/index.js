import { templateComposer } from './template.js';
import { agentComposer } from './agent.js';

export function pickComposer(job) {
  return job.agent && job.agent !== 'none'
    ? agentComposer
    : templateComposer;
}
