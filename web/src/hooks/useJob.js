import { useState, useEffect, useCallback } from 'react';
import { getJob, cancelJob as apiCancel } from '../api/client';

export function useJob(id) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getJob(id);
      setJob(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const cancel = useCallback(async () => {
    try {
      const updated = await apiCancel(id);
      setJob(updated);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll until terminal
  useEffect(() => {
    if (!job || ['done', 'failed', 'cancelled'].includes(job.status)) return;
    const interval = setInterval(refresh, 1500);
    return () => clearInterval(interval);
  }, [job, refresh]);

  return { job, loading, error, cancel, refresh };
}
