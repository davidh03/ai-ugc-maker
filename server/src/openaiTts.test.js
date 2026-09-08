import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { synthesizeOpenAIVoiceover } from './openaiTts.js';

describe('OpenAI voiceover', () => {
  it('writes the binary speech response and never exposes the key in metadata', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aiugc-openai-tts-')); const output = path.join(dir, 'voice.mp3');
    const result = await synthesizeOpenAIVoiceover('Hello https://example.com', output, { apiKey: 'test-key', fetchImpl: async (_url, options) => { assert.equal(options.headers.authorization, 'Bearer test-key'); return { ok: true, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }; } });
    assert.equal(result.provider, 'openai-tts'); assert.equal(result.script, 'Hello'); assert.equal((await readFile(output)).length, 3); assert.equal(Object.values(result).includes('test-key'), false); await rm(dir, { recursive: true, force: true });
  });
  it('fails clearly when no API key is configured', async () => await assert.rejects(() => synthesizeOpenAIVoiceover('Hello', '/tmp/no-openai-voice.mp3', { apiKey: '' }), /OPENAI_API_KEY/));
});
