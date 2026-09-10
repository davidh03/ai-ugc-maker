import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentationScript } from './scriptParser.js';
const sample = `Cold Open\nTimecode: 0:00 – 0:08\n\nVisual\nFull screen recording — a live pipeline\n\nVoiceover\n\n“This is an account with fourteen hundred contacts. Nothing.”\n\nThe Real Problem\nTimecode: 0:08 – 0:20\n\nVisual\nA stale contact record\n\nOn Screen: Replied once. Then nothing. 41 days ago.\n\nVoiceover\n\n“They replied once. Somebody meant to get back to them. That was six weeks ago.”`;
describe('presentation script parser', () => { it('extracts timed visual and voiceover beats', () => { const result = parsePresentationScript(sample); assert.equal(result.detected, true); assert.equal(result.scenes.length, 2); assert.equal(result.scenes[0].startSec, 0); assert.equal(result.scenes[1].endSec, 20); assert.match(result.script, /fourteen hundred contacts/); assert.equal(result.scenes[1].onScreen, 'Replied once. Then nothing. 41 days ago.'); });
  it('keeps on-screen labels and production directions out of narration', () => {
    const input = `Scene 1\nTimecode: 0:00 – 0:07\n\nVisual\nA pipeline\n\nVoiceover:\n“This is the account.”\n\nOn-screen text:\n1,400 contacts.\n\nScene 2\nTimecode: 0:07 – 0:10\n\nVisual\nAn outro\n\nVoiceover:\nNone.\n\nAudio:\nKeep the final scene quiet.\n\nOverall visual direction:\nDo not speak this.`;
    const result = parsePresentationScript(input);
    assert.equal(result.scenes[0].voiceover, '\"This is the account.\"');
    assert.equal(result.scenes[0].onScreen, '1,400 contacts.');
    assert.equal(result.scenes.length, 1);
    assert.equal(result.script, '\"This is the account.\"');
  });
  it('tolerates whitespace before the colon in section headers', () => {
    const input = `Scene 1\nTimecode: 0:00 – 0:05\n\nVisual :\nA pipeline\n\nVoiceover :\n"Whitespace before the colon should still parse."`;
    const result = parsePresentationScript(input);
    assert.equal(result.detected, true);
    assert.equal(result.scenes[0].voiceover, '"Whitespace before the colon should still parse."');
    assert.equal(result.scenes[0].visual, 'A pipeline');
  });
});
