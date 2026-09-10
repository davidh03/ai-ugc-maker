import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOutputUrl, getThumbnailUrl } from '../api/client';
import { useJobs } from '../hooks/useJobs';
import PromptForm from '../components/PromptForm';

function Recent({ jobs }) {
  return <section className="panel recent-panel"><div className="section-heading"><div><div className="eyebrow">Library</div><h2>Recent generations</h2></div><span className="muted">{jobs.length} total</span></div><div className="recent">{jobs.slice(0, 6).map(job => <Link className="recent-card" to={'/jobs/' + job.id} key={job.id}><div className="thumb">{job.status === 'done' ? <img src={getThumbnailUrl(job.id)} alt="" loading="lazy" /> : <span aria-hidden="true">◌</span>}</div><div className="recent-copy"><strong>{job.brief}</strong><span className="badge">{job.status} · {job.durationSec}s · {job.provider || 'template'}</span></div></Link>)}{!jobs.length && <div className="preview empty-preview">Your generated videos will show up here.</div>}</div></section>;
}

function OutputWorkspace({ job }) {
  return <section className="panel output-panel"><div className="eyebrow">Preview</div><div className="section-heading"><div><h2>Output workspace</h2><p className="muted output-subtitle">{job?.status === 'done' ? 'Latest successful render' : job ? 'Your video is being prepared' : 'Your latest render will appear here'}</p></div>{job && <span className="badge">{job.status}</span>}</div>{job?.status === 'done' ? <div className="video-frame"><video controls playsInline preload="metadata" poster={getThumbnailUrl(job.id)} src={getOutputUrl(job.id)} /></div> : <div className="preview output-empty"><div><span className="output-icon">{job ? '◌' : '▣'}</span><strong>{job ? 'Rendering your video…' : 'No render selected'}</strong><span>{job ? 'This workspace updates automatically when it is ready.' : 'Generate a video to preview it here.'}</span></div></div>}</section>;
}

export default function Home() {
  const { jobs, loading, createJob } = useJobs();
  const [creating, setCreating] = useState(false);
  const [previewJobId, setPreviewJobId] = useState(null);
  const previewJob = useMemo(() => jobs.find(job => job.id === previewJobId) || jobs.find(job => job.status === 'done') || null, [jobs, previewJobId]);
  const handleCreate = async data => { setCreating(true); try { const job = await createJob(data); setPreviewJobId(job.id); } finally { setCreating(false); } };
  return <><header className="page-header"><div><div className="eyebrow">AI video studio</div><h1>Make it watchable.</h1><p className="muted">Turn a sharp brief into a finished UGC-style video.</p></div><div className="badge engine-status"><span className="status-dot" /> Local render engine</div></header><div className="studio-grid"><div><PromptForm onSubmit={handleCreate} loading={creating} /></div><div className="workspace-column"><OutputWorkspace job={loading ? null : previewJob} /><Recent jobs={loading ? [] : jobs} /></div></div></>;
}
