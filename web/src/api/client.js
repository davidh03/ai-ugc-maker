const BASE = '/api';
export async function fetchJson(path, options = {}) { const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options }); if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || err.error || res.statusText); } return res.json(); }
export const postJob = data => fetchJson('/jobs', { method: 'POST', body: JSON.stringify(data) });
export const getJobs = () => fetchJson('/jobs');
export const getJob = id => fetchJson('/jobs/' + id);
export const cancelJob = id => fetchJson('/jobs/' + id + '/cancel', { method: 'POST' });
export const deleteJob = id => fetchJson('/jobs/' + id, { method: 'DELETE' });
export async function getModels(provider = 'opencode') { const data = await fetchJson('/providers/models?provider=' + encodeURIComponent(provider)); return data.models || []; }
export async function getVoices(provider) { const data = await fetchJson('/providers/voices?provider=' + encodeURIComponent(provider)); return data.voices || []; }
export const getProviders = () => fetchJson('/providers');
export const getProviderStatus = provider => fetchJson('/providers/' + provider + '/status');
export const startProviderLogin = (provider, flow) => fetchJson('/providers/' + provider + '/connect', { method: 'POST', body: JSON.stringify({ flow }) });
export const getProviderLogin = (provider, id) => fetchJson('/providers/' + provider + '/login/' + id);
export const cancelProviderLogin = (provider, id) => fetchJson('/providers/' + provider + '/login/' + id + '/cancel', { method: 'POST' });
export function getOutputUrl(id) { return BASE + '/jobs/' + id + '/output'; }
export function getThumbnailUrl(id) { return BASE + '/jobs/' + id + '/thumbnail'; }
export const getRevisionPlan = (id, data, options = {}) => fetchJson('/jobs/' + id + '/revision-plan', { ...options, method: 'POST', body: JSON.stringify(data) });
export const createRevision = (id, data) => fetchJson('/jobs/' + id + '/revisions', { method: 'POST', body: JSON.stringify(data) });
