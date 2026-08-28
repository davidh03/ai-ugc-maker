import { useParams, Link } from 'react-router-dom';
import { useJob } from '../hooks/useJob';
import JobStatusBadge from '../components/JobStatusBadge';
import ProgressBar from '../components/ProgressBar';
import VideoPlayer from '../components/VideoPlayer';

export default function JobDetail() {
  const { id } = useParams();
  const { job, loading, error, cancel } = useJob(id);

  if (loading) return <p style={{ color: '#666' }}>Loading...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>Error: {error}</p>;
  if (!job) return <p style={{ color: '#666' }}>Job not found</p>;

  return (
    <div>
      <Link to="/" style={{ color: '#3b82f6', fontSize: 14 }}>← Back</Link>
      <h2 style={{ margin: '16px 0 8px' }}>Job {job.id}</h2>
      <p style={{ color: '#aaa', marginBottom: 16 }}>{job.brief}</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <JobStatusBadge status={job.status} />
        <span style={{ color: '#888', fontSize: 13 }}>{job.durationSec}s · {job.style}</span>
        {['queued', 'running'].includes(job.status) && (
          <button
            onClick={cancel}
            style={{
              marginLeft: 'auto',
              padding: '6px 14px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
        )}
      </div>

      <ProgressBar stage={job.stage} progress={job.progress} startedAt={job.startedAt} />

      {job.status === 'done' && (
        <div style={{ marginTop: 16 }}>
          <VideoPlayer jobId={job.id} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <a
              href={'/api/jobs/' + job.id + '/output?download=1'}
              style={{
                padding: '8px 18px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              ⬇ Download MP4
            </a>
            {job.assetsUsed && job.assetsUsed.length > 0 && (
              <span style={{ fontSize: 13, color: '#6ee7a0' }}>
                ✓ {job.assetsUsed.length} asset{job.assetsUsed.length > 1 ? 's' : ''} used in this video
              </span>
            )}
            {job.requiredAssetsNotUsed && job.requiredAssetsNotUsed.length > 0 && (
              <span style={{ fontSize: 13, color: '#ef4444' }} title={job.requiredAssetsNotUsed.join(', ')}>
                ⚠ REQUIRED asset(s) missing: {job.requiredAssetsNotUsed.length}
              </span>
            )}
            {job.assets && job.assets.length > 0 && (!job.assetsUsed || job.assetsUsed.length === 0) && (
              <span style={{ fontSize: 13, color: '#fbbf24' }}>
                ⚠ {job.assets.length} asset(s) uploaded but none referenced in the composition
              </span>
            )}
          </div>
        </div>
      )}

      {job.status === 'failed' && (
        <div style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: '#2a1a1a',
          borderRadius: 8,
          color: '#ef4444',
          fontSize: 13,
        }}>
          {job.error}
        </div>
      )}
    </div>
  );
}
