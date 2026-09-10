import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { synthesizeCartesiaVoiceover, voiceoverScriptFromBrief } from './cartesiaTts.js';

describe('Cartesia voiceover', () => {
  it('creates a clean narration script from the brief', () => assert.equal(voiceoverScriptFromBrief('Say hello https://example.com --- research --- to viewers'), 'Say hello to viewers'));

  it('writes the binary speech response and never exposes the key in metadata', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aiugc-cartesia-tts-'));
    const output = path.join(dir, 'voice.mp3');
    const result = await synthesizeCartesiaVoiceover('Hello viewers', output, {
      apiKey: 'test-key',
      voiceId: 'voice-123',
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://api.cartesia.ai/tts/bytes');
        assert.equal(options.headers.authorization, 'Bearer test-key');
        assert.equal(options.headers['Cartesia-Version'], '2026-08-14');
        const body = JSON.parse(options.body);
        assert.equal(body.transcript, 'Hello viewers');
        assert.deepEqual(body.voice, { id: 'voice-123' });
        return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
      },
    });
    assert.equal(result.provider, 'cartesia-tts');
    assert.equal(result.voice, 'voice-123');
    assert.equal((await readFile(output)).length, 3);
    assert.equal(Object.values(result).includes('test-key'), false);
    await rm(dir, { recursive: true, force: true });
  });

  it('fails clearly when no API key is configured', async () =>
    await assert.rejects(() => synthesizeCartesiaVoiceover('Hello', '/tmp/no-cartesia-voice.mp3', { apiKey: '' }), /CARTESIA_API_KEY/));

  it('fails clearly on a non-OK response', async () =>
    await assert.rejects(
      () => synthesizeCartesiaVoiceover('Hello', '/tmp/no-cartesia-voice.mp3', { apiKey: 'test-key', fetchImpl: async () => ({ ok: false, status: 401 }) }),
      /HTTP 401/
    ));
});
