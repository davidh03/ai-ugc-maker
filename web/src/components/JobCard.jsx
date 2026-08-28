import { Link } from 'react-router-dom';
import JobStatusBadge from './JobStatusBadge';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function JobCard({ job }) {
  return (
    <Link to={`/jobs/${job.id}`} style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: '#1a1a1a',
      borderRadius: 8,
      textDecoration: 'none',
      color: '#fff',
      marginBottom: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {job.brief}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          {job.durationSec}s · {job.style} · {timeAgo(job.createdAt)}
          {job.assets && job.assets.length > 0 && (
            <span style={{ color: '#6ee7a0', marginLeft: 8 }}>🎞 {job.assets.length}</span>
          )}
          {job.assetsUsed && job.assetsUsed.length > 0 && (
            <span style={{ color: '#3b82f6', marginLeft: 4 }}>✓ used {job.assetsUsed.length}</span>
          )}
          {job.requiredAssetsNotUsed && job.requiredAssetsNotUsed.length > 0 && (
            <span style={{ color: '#ef4444', marginLeft: 4 }}>⚠ req missing</span>
          )}
        </div>
      </div>
      <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        {job.status === 'done' && (
          <a
            href={'/api/jobs/' + job.id + '/output?download=1'}
            onClick={e => e.stopPropagation()}
            title="Download MP4"
            style={{ color: '#3b82f6', textDecoration: 'none', fontSize: 18 }}
          >
            ⬇
          </a>
        )}
        <JobStatusBadge status={job.status} />
      </div>
    </Link>
  );
}
