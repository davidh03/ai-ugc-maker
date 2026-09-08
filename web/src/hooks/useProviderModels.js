import { useEffect, useState } from 'react';
import { getModels } from '../api/client';
export function useProviderModels(provider) { const [models, setModels] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const refresh = async () => { setLoading(true); setError(''); try { setModels(await getModels(provider)); } catch (e) { setError(e.message); setModels([]); } finally { setLoading(false); } }; useEffect(() => { refresh(); }, [provider]); return { models, loading, error, refresh }; }
