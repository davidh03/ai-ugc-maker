import { useState } from 'react';

const COLORS = { pending: '#666', running: '#a78bfa', done: '#4ade80', reused: '#38bdf8', failed: '#fb7185', skipped: '#fbbf24', cancelled: '#f59e0b' };
const ICONS = { done: '✓', reused: '↻', failed: '!', skipped: '—', cancelled: '⏸' };
const DETAIL = {
  pending: 'Not started yet.',
  skipped: 'Not needed for this generation.',
  running: 'In progress…',
  reused: 'Reused from the source version.',
  done: 'Completed.',
  failed: 'This step did not finish — the generation failed.',
  cancelled: 'Generation was cancelled before this step finished.',
};

export default function WorkflowGraph({ workflow = [], stage, jobStatus }) {
  const [expanded, setExpanded] = useState(null);
  // A node can be left "running" forever in the stored data if the job died
  // mid-stage — once the job itself is terminal, that node is visually done too.
  const terminalOverride = jobStatus === 'failed' ? 'failed' : jobStatus === 'cancelled' ? 'cancelled' : null;
  const displayStatusOf = node => (node.status === 'running' && terminalOverride) ? terminalOverride : node.status;

  return (
    <section className="panel workflow-panel">
      <div className="eyebrow">Live workflow</div>
      <div className="workflow-head">
        <h2>Generation pipeline</h2>
        <span className="muted">{stage ? `Running: ${stage}` : 'Waiting for job'}</span>
      </div>
      <ol className="workflow-graph" aria-label="Live generation workflow">
        {workflow.map((node, index) => {
          const isOpen = expanded === node.id;
          const displayStatus = displayStatusOf(node);
          const color = COLORS[displayStatus] || COLORS.pending;
          const next = workflow[index + 1];
          const bypass = displayStatus === 'skipped' || (next && displayStatusOf(next) === 'skipped');
          return (
            <li className={'workflow-step status-' + displayStatus} key={node.id}>
              <button type="button" className="workflow-node" style={{ '--wf-color': color }} onClick={() => setExpanded(isOpen ? null : node.id)} aria-expanded={isOpen}>
                <span className="workflow-icon" aria-hidden="true">
                  {displayStatus === 'running' ? <span className="workflow-spinner" /> : (ICONS[displayStatus] || '○')}
                </span>
                <span className="workflow-copy">
                  <strong>{node.label}</strong>
                  <small>{displayStatus}</small>
                </span>
                {node.error && <span className="workflow-flag" title="This step reported an error" aria-hidden="true">⚠</span>}
                <span className="workflow-chevron" aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
              </button>
              {isOpen && (
                <div className="workflow-detail">
                  {node.error ? <p className="workflow-error">{node.error}</p> : <p className="muted">{DETAIL[displayStatus] || DETAIL.pending}</p>}
                </div>
              )}
              {index < workflow.length - 1 && (
                bypass ? (
                  <svg className="workflow-bypass" viewBox="0 0 16 18" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M8,0 C1,5 1,13 8,18" />
                  </svg>
                ) : (
                  <span className={'workflow-link' + (displayStatus === 'done' || displayStatus === 'reused' ? ' filled' : displayStatus === 'running' ? ' active' : '')} aria-hidden="true" />
                )
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
