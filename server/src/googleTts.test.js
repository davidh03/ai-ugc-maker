import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { synthesizeGoogleVoiceover, voiceoverScriptFromBrief } from './googleTts.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Google voiceover', () => {
  it('creates a clean narration script from the brief', () => assert.equal(voiceoverScriptFromBrief('Say hello https://example.com --- research --- to viewers'), 'Say hello to viewers'));
  it('decodes Google audioContent into an MP3 file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'aiugc-tts-')); const output = path.join(dir, 'voice.mp3');
    const result = await synthesizeGoogleVoiceover('Hello viewers', output, { apiKey: 'test-key', fetchImpl: async () => response({ audioContent: Buffer.from('audio').toString('base64') }) });
    assert.equal(result.provider, 'google-cloud-tts'); assert.equal((await readFile(output)).toString(), 'audio'); await rm(dir, { recursive: true, force: true });
  });
  it('fails clearly when no key is configured', async () => await assert.rejects(() => synthesizeGoogleVoiceover('Hello', '/tmp/no-voice.mp3', { apiKey: '' }), /GOOGLE_TTS_API_KEY/));
});
