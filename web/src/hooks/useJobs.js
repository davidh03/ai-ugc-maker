import { useState, useEffect, useCallback } from 'react';
import { getJobs, postJob, deleteJob as apiDeleteJob, toggleFavorite as apiToggleFavorite } from '../api/client';

export function useJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getJobs();
      setJobs(data);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createJob = useCallback(async (data) => {
    const job = await postJob(data);
    setJobs(prev => [job, ...prev]);
    return job;
  }, []);

  const removeJob = useCallback(async (id) => {
    await apiDeleteJob(id);
    setJobs(prev => prev.filter(job => job.id !== id));
  }, []);

  const toggleFavorite = useCallback(async (id) => {
    // Flip optimistically so the star responds instantly; reconcile with
    // whatever the server actually persisted once the request resolves.
    setJobs(prev => prev.map(job => job.id === id ? { ...job, favorite: !job.favorite } : job));
    try {
      const updated = await apiToggleFavorite(id);
      setJobs(prev => prev.map(job => job.id === id ? updated : job));
    } catch (err) {
      setJobs(prev => prev.map(job => job.id === id ? { ...job, favorite: !job.favorite } : job));
      throw err;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while any job is active, including a 'done' job whose AI reviewer
  // is still pending/running in the background (status stays 'done' the
  // whole time it works, so it wouldn't otherwise count as active).
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running' || (j.status === 'done' && ['pending', 'running'].includes(j.reviewerStatus)));
    if (!hasActive) return;
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [jobs, refresh]);

  return { jobs, loading, createJob, removeJob, toggleFavorite, refresh };
}
