const COLORS = {
  queued: '#888',
  running: '#3b82f6',
  done: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
};

export default function JobStatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      color: '#fff',
      backgroundColor: COLORS[status] || '#666',
    }}>
      {status}
    </span>
  );
}
