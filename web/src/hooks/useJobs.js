import { useState, useEffect, useCallback } from 'react';
import { getJobs, postJob, deleteJob as apiDeleteJob } from '../api/client';

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

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [jobs, refresh]);

  return { jobs, loading, createJob, removeJob, refresh };
}
