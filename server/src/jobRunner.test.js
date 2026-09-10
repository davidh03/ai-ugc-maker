import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractVoiceoverScript, resolveScriptDrivenDurationSec, pickVoiceoverSynth } from './jobRunner.js';
import { synthesizeGoogleVoiceover } from './googleTts.js';
import { synthesizeMiniMaxVoiceover } from './minimaxTts.js';
import { synthesizeCartesiaVoiceover } from './cartesiaTts.js';
import { synthesizeOpenAIVoiceover } from './openaiTts.js';

describe('voiceover script extraction', () => {
  it('extracts the composer-provided JSON string instead of using the generic fallback', () => {
    const html = '<script>\n  window.__voiceoverScript = \"A child followed a song. Across time, courage became destiny.\";\n</script>';
    assert.equal(extractVoiceoverScript(html), 'A child followed a song. Across time, courage became destiny.');
  });
  it('returns empty when the assignment is missing or invalid', () => {
    assert.equal(extractVoiceoverScript('<script>window.__voiceoverScript = not-json;</script>'), '');
    assert.equal(extractVoiceoverScript('<script>window.__voiceoverDirection = \"warm\";</script>'), '');
  });
});

describe('script-driven duration (voiceover dictates duration, structured script)', () => {
  it('uses the last scene\'s endSec as the real duration instead of the form value', () => {
    const parsed = { detected: true, scenes: [{ startSec: 0, endSec: 7 }, { startSec: 7, endSec: 15 }, { startSec: 15, endSec: 53.2 }] };
    assert.equal(resolveScriptDrivenDurationSec(parsed, 60), 54);
  });
  it('rounds up so narration is never cut off by a fractional second', () => {
    const parsed = { detected: true, scenes: [{ startSec: 0, endSec: 10.1 }] };
    assert.equal(resolveScriptDrivenDurationSec(parsed, 15), 11);
  });
  it('falls back to the original duration when the script has no usable scenes', () => {
    assert.equal(resolveScriptDrivenDurationSec({ detected: true, scenes: [] }, 30), 30);
    assert.equal(resolveScriptDrivenDurationSec(null, 30), 30);
  });
});

describe('pickVoiceoverSynth', () => {
  it('routes each provider to its own synthesizer and voice option shape', () => {
    assert.equal(pickVoiceoverSynth({ voiceoverProvider: 'google-cloud-tts', voiceoverVoice: 'v1' }).synthesize, synthesizeGoogleVoiceover);
    assert.deepEqual(pickVoiceoverSynth({ voiceoverProvider: 'google-cloud-tts', voiceoverVoice: 'v1' }).voiceOptions, { voiceName: 'v1' });
    assert.equal(pickVoiceoverSynth({ voiceoverProvider: 'minimax-tts', voiceoverVoice: 'v2' }).synthesize, synthesizeMiniMaxVoiceover);
    assert.deepEqual(pickVoiceoverSynth({ voiceoverProvider: 'minimax-tts', voiceoverVoice: 'v2' }).voiceOptions, { voiceId: 'v2' });
    assert.equal(pickVoiceoverSynth({ voiceoverProvider: 'cartesia-tts', voiceoverVoice: 'v3' }).synthesize, synthesizeCartesiaVoiceover);
    assert.deepEqual(pickVoiceoverSynth({ voiceoverProvider: 'cartesia-tts', voiceoverVoice: 'v3' }).voiceOptions, { voiceId: 'v3' });
    assert.equal(pickVoiceoverSynth({ voiceoverProvider: 'openai-tts', voiceoverVoice: 'v4' }).synthesize, synthesizeOpenAIVoiceover);
    assert.deepEqual(pickVoiceoverSynth({ voiceoverProvider: 'openai-tts', voiceoverVoice: 'v4' }).voiceOptions, { voice: 'v4' });
  });
});
