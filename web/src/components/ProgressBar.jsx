import { useState, useEffect, useRef } from 'react';

// Stage-based progress mapping: composing/linting are agent stages with no
// real % — show an indeterminate bar + elapsed time instead of a fake 0%.
const STAGE_WEIGHT = { composing: 5, linting: 70, rendering: 75, encoding: 95 };

export default function ProgressBar({ stage, progress, startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(startedAt || Date.now());
  useEffect(() => {
    startRef.current = startedAt || Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [stage, startedAt]);

  if (!stage) {
    if (elapsed === 0) return null;
    return null;
  }

  const base = STAGE_WEIGHT[stage] ?? 0;
  // composing: show subtle progress within [0..70) so it never looks frozen
  const shown = stage === 'composing'
    ? Math.min(base + (elapsed % 60) / 60 * 60, 69)
    : progress != null && progress > 0 ? Math.min(base + (progress / 100) * (100 - base), 99) : base;
  const indeterminate = stage === 'composing' || (progress == null || progress <= 0);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ textTransform: 'capitalize' }}>{stage} — {indeterminate ? 'working…' : progress + '%'}</span>
        <span style={{ color: '#666', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
      </div>
      <div style={{ width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        {indeterminate ? (
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: '30%',
            backgroundColor: '#3b82f6', borderRadius: 3,
            animation: 'ugc-slide 1.4s ease-in-out infinite',
          }} />
        ) : (
          <div style={{ width: `${shown}%`, height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.3s' }} />
        )}
      </div>
      <style>{`@keyframes ugc-slide { 0% { left: -30%; } 100% { left: 100%; } }`}</style>
    </div>
  );
}