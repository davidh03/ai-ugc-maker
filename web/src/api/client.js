const BASE = '/api';

export async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function postJob(data) {
  return fetchJson('/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getJobs() {
  return fetchJson('/jobs');
}

export async function getJob(id) {
  return fetchJson(`/jobs/${id}`);
}

export async function cancelJob(id) {
  return fetchJson(`/jobs/${id}/cancel`, { method: 'POST' });
}

export function getOutputUrl(id) {
  return `${BASE}/jobs/${id}/output`;
}
