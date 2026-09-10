import { useEffect, useState } from 'react';
import { getVoices } from '../api/client';

export function useProviderVoices(provider) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!provider) { setVoices([]); return; }
    let cancelled = false;
    setLoading(true); setError('');
    getVoices(provider)
      .then(v => { if (!cancelled) setVoices(v); })
      .catch(e => { if (!cancelled) { setError(e.message); setVoices([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [provider]);
  return { voices, loading, error };
}
