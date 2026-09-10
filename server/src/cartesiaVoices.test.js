import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCartesiaVoices } from './cartesiaVoices.js';

describe('Cartesia voice catalog', () => {
  it('returns a small known-good fallback when no API key is configured', async () => {
    const voices = await getCartesiaVoices({ apiKey: '' });
    assert.ok(voices.length > 0);
    assert.ok(voices.every(v => v.id && v.name));
  });

  it('maps the live catalog response into { id, name, gender } entries', async () => {
    const voices = await getCartesiaVoices({
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        assert.match(url, /^https:\/\/api\.cartesia\.ai\/voices\?/);
        assert.equal(options.headers.authorization, 'Bearer test-key');
        return {
          ok: true,
          json: async () => ({
            data: [
              { id: 'v1', name: 'Aria', gender: 'feminine', status: 'active', access: 'public' },
              { id: 'v2', name: 'Marcus', gender: 'masculine', status: 'active', access: 'public' },
              { id: 'v3', name: 'Archived Voice', status: 'archived', access: 'public' },
            ],
          }),
        };
      },
    });
    assert.deepEqual(voices.map(v => v.id), ['v1', 'v2']);
    assert.equal(voices[0].name, 'Aria');
  });

  it('fails clearly on a non-OK response', async () =>
    await assert.rejects(
      () => getCartesiaVoices({ apiKey: 'a-different-test-key', fetchImpl: async () => ({ ok: false, status: 500 }) }),
      /HTTP 500/
    ));
});
