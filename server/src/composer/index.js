import { templateComposer } from './template.js';
import { agentComposer } from './agent.js';
import { config } from '../config.js';

export function pickComposer() {
  return config.composer === 'agent' && config.agentCmd
    ? agentComposer
    : templateComposer;
}
