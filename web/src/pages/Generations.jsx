import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getThumbnailUrl } from '../api/client';
import JobStatusBadge from '../components/JobStatusBadge';
import { useJobs } from '../hooks/useJobs';

const FILTERS = [
  { id: 'all', label: 'All generations' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'done', label: 'Successful' },
  { id: 'active', label: 'Active' },
  { id: 'failed', label: 'Failed' },
];

function matchesFilter(job, filter) {
  if (filter === 'favorites') return Boolean(job.favorite);
  if (filter === 'done') return job.status === 'done';
  if (filter === 'active') return job.status === 'queued' || job.status === 'running';
  if (filter === 'failed') return job.status === 'failed' || job.status === 'cancelled';
  return true;
}

function GenerationCard({ job, onDelete, deleting, deleteError, onToggleFavorite }) {
  const isDone = job.status === 'done';
  const canDelete = !['queued', 'running'].includes(job.status);
  return <Link className="generation-card" to={'/jobs/' + job.id}>
    <div className="generation-thumb">{isDone ? <img src={getThumbnailUrl(job.id)} alt="" loading="lazy" /> : <span aria-hidden="true">{job.status === 'failed' ? '!' : '◌'}</span>}{isDone && <span className="thumb-play" aria-hidden="true">▶</span>}</div>
    <div className="generation-card-body"><div className="generation-card-top"><JobStatusBadge status={job.status} /><span className="generation-id">{job.revisionNumber ? `Revision ${job.revisionNumber}` : '#' + job.id}</span><button type="button" className={'generation-favorite' + (job.favorite ? ' active' : '')} title={job.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={Boolean(job.favorite)} onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(job.id); }}>{job.favorite ? '★' : '☆'}</button>{canDelete && <button type="button" className="generation-delete" title="Delete this generation" disabled={deleting} onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(job.id); }}>{deleting ? '…' : '✕'}</button>}</div><h2>{job.brief}</h2><div className="generation-meta"><span>{job.durationSec}s</span><span>{job.style || 'product'}</span><span>{job.voiceover ? 'Voiceover' : 'No voiceover'}</span></div>{isDone && <span className="generation-action">Open output <span aria-hidden="true">↗</span></span>}{job.error && <p className="generation-error">{job.error}</p>}{deleteError && <p className="generation-error">{deleteError}</p>}</div>
  </Link>;
}

export default function Generations() {
  const { jobs, loading, removeJob, toggleFavorite } = useJobs();
  const [filter, setFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState({});
  const visibleJobs = useMemo(() => jobs.filter(job => matchesFilter(job, filter)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [jobs, filter]);
  const counts = useMemo(() => ({ all: jobs.length, favorites: jobs.filter(job => job.favorite).length, done: jobs.filter(job => job.status === 'done').length, active: jobs.filter(job => job.status === 'queued' || job.status === 'running').length, failed: jobs.filter(job => job.status === 'failed' || job.status === 'cancelled').length }), [jobs]);
  const handleDelete = async id => {
    if (!window.confirm('Delete this generation? This also removes its rendered video and cannot be undone.')) return;
    setDeletingId(id);
    setDeleteErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
    try { await removeJob(id); }
    catch (e) { setDeleteErrors(prev => ({ ...prev, [id]: e.message })); }
    finally { setDeletingId(null); }
  };
  const handleToggleFavorite = id => { toggleFavorite(id).catch(err => console.error('Failed to update favorite:', err)); };
  return <><header className="page-header generations-header"><div><div className="eyebrow">Library</div><h1>All generations.</h1><p className="muted">Every render, in one place.</p></div><Link className="primary create-link" to="/">New generation ↗</Link></header><section className="panel generations-panel"><div className="generation-toolbar"> <div className="filter-list" role="tablist" aria-label="Generation filters">{FILTERS.map(item => <button className={'filter-button' + (filter === item.id ? ' active' : '')} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} key={item.id}>{item.label}<span>{counts[item.id]}</span></button>)}</div><span className="muted generation-count">Showing {visibleJobs.length} of {jobs.length}</span></div>{loading ? <div className="preview generations-empty">Loading generations…</div> : visibleJobs.length ? <div className="generations-grid">{visibleJobs.map(job => <GenerationCard job={job} key={job.id} onDelete={handleDelete} deleting={deletingId === job.id} deleteError={deleteErrors[job.id]} onToggleFavorite={handleToggleFavorite} />)}</div> : <div className="preview generations-empty">{filter === 'favorites' ? 'No favorites yet — star a generation to pin it here.' : 'No generations in this view.'}</div>}</section></>;
}
