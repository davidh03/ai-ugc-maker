const CARTESIA_VOICES_URL = process.env.CARTESIA_VOICES_URL || 'https://api.cartesia.ai/voices';
const CARTESIA_VERSION = '2026-08-14';
const cache = { key: null, value: null, expiresAt: 0 };

// A small, known-good fallback so the voice picker never renders empty when
// no CARTESIA_API_KEY is configured yet (e.g. before first-time setup).
const FALLBACK_VOICES = [
  { id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', name: 'Skylar', gender: 'feminine', default: true },
];

export async function getCartesiaVoices({ apiKey = process.env.CARTESIA_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) return FALLBACK_VOICES;
  if (cache.key === apiKey && cache.value && cache.expiresAt > Date.now()) return cache.value;
  const url = `${CARTESIA_VOICES_URL}?limit=20&is_owner=false&language=en`;
  const response = await fetchImpl(url, { headers: { 'Cartesia-Version': CARTESIA_VERSION, authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Cartesia voice list request failed with HTTP ${response.status}`);
  const payload = await response.json();
  const list = Array.isArray(payload) ? payload : payload.data || payload.voices || [];
  const voices = list
    .filter(v => v.status !== 'archived' && v.access !== 'private')
    .slice(0, 12)
    .map(v => ({ id: v.id, name: v.name || v.id, gender: v.gender || null, default: false }));
  cache.key = apiKey;
  cache.value = voices.length ? voices : FALLBACK_VOICES;
  cache.expiresAt = Date.now() + 5 * 60 * 1000;
  return cache.value;
}
