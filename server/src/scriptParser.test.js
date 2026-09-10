import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentationScript, applyMeasuredSceneDurations, narrationPlanPrompt, extractExplicitNarration } from './scriptParser.js';
const sample = `Cold Open\nTimecode: 0:00 – 0:08\n\nVisual\nFull screen recording — a live pipeline\n\nVoiceover\n\n“This is an account with fourteen hundred contacts. Nothing.”\n\nThe Real Problem\nTimecode: 0:08 – 0:20\n\nVisual\nA stale contact record\n\nOn Screen: Replied once. Then nothing. 41 days ago.\n\nVoiceover\n\n“They replied once. Somebody meant to get back to them. That was six weeks ago.”`;
describe('presentation script parser', () => { it('extracts timed visual and voiceover beats', () => { const result = parsePresentationScript(sample); assert.equal(result.detected, true); assert.equal(result.scenes.length, 2); assert.equal(result.scenes[0].startSec, 0); assert.equal(result.scenes[1].endSec, 20); assert.match(result.script, /fourteen hundred contacts/); assert.equal(result.scenes[1].onScreen, 'Replied once. Then nothing. 41 days ago.'); });
  it('keeps on-screen labels and production directions out of narration', () => {
    const input = `Scene 1\nTimecode: 0:00 – 0:07\n\nVisual\nA pipeline\n\nVoiceover:\n“This is the account.”\n\nOn-screen text:\n1,400 contacts.\n\nScene 2\nTimecode: 0:07 – 0:10\n\nVisual\nAn outro\n\nVoiceover:\nNone.\n\nAudio:\nKeep the final scene quiet.\n\nOverall visual direction:\nDo not speak this.`;
    const result = parsePresentationScript(input);
    assert.equal(result.scenes[0].voiceover, '\"This is the account.\"');
    assert.equal(result.scenes[0].onScreen, '1,400 contacts.');
    // The narration-free outro is still a real scene (its 3s is real time on
    // the timeline) — only its voiceover text is empty, so it isn't dropped.
    assert.equal(result.scenes.length, 2);
    assert.equal(result.scenes[1].voiceover, '');
    assert.equal(result.scenes[1].startSec, 7);
    assert.equal(result.scenes[1].endSec, 10);
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

describe('applyMeasuredSceneDurations', () => {
  it('rebuilds cumulative start/end times from real per-scene durations, not the brief estimate', () => {
    const scenes = [
      { title: 'Scene 1', startSec: 0, endSec: 7, voiceover: 'a' },
      { title: 'Scene 2', startSec: 7, endSec: 16, voiceover: 'b' },
      { title: 'Scene 3 (outro)', startSec: 16, endSec: 22, voiceover: '' },
    ];
    const result = applyMeasuredSceneDurations(scenes, [6.2, 8.9, 6]);
    const round = n => Math.round(n * 1e6) / 1e6;
    assert.deepEqual(result.map(s => [s.id, round(s.startSec), round(s.endSec), s.durationSec]), [
      ['scene1', 0, 6.2, 6.2],
      ['scene2', 6.2, 15.1, 8.9],
      ['scene3', 15.1, 21.1, 6],
    ]);
  });
  it('treats a missing or non-finite duration as zero rather than throwing', () => {
    const result = applyMeasuredSceneDurations([{ title: 'A' }, { title: 'B' }], [5]);
    assert.deepEqual(result.map(s => s.durationSec), [5, 0]);
  });
});

describe('narrationPlanPrompt', () => {
  it('returns nothing for an undetected plan', () => {
    assert.equal(narrationPlanPrompt({ detected: false }), '');
    assert.equal(narrationPlanPrompt(null), '');
  });
  it('tells the agent timings are estimates by default', () => {
    const prompt = narrationPlanPrompt({ detected: true, scenes: [{ startSec: 0, endSec: 5 }] });
    assert.match(prompt, /Pace each visual reveal/);
    assert.doesNotMatch(prompt, /REAL measured length/);
  });
  it('demands exact compliance when timings come from measured audio', () => {
    const prompt = narrationPlanPrompt({ detected: true, timingSource: 'measured', scenes: [{ startSec: 0, endSec: 5 }] });
    assert.match(prompt, /REAL measured length/);
    assert.match(prompt, /within 0\.05s/);
  });
});

describe('extractExplicitNarration', () => {
  it('finds a quoted line after a label buried mid-bullet, not just at a line start', () => {
    const brief = `Create a 10-second comedic clip.

Scene structure:
- 0.0-3.0s: Wide shot of the dog looking guilty near a torn-up couch cushion.
- 3.0-7.0s: Cut to the owner walking in, reacting in shock. Narration/dialogue: "Who did this?!" Deliver the line as a light, exaggerated comedic beat.
- 7.0-10.0s: End card reading: "The dog did this."

Audio and narration:
- Use natural, conversational narration with a playful comedic delivery.`;
    assert.equal(extractExplicitNarration(brief), 'Who did this?!');
  });
  it('ignores a label match with no quoted text (a direction about narration, not narration itself)', () => {
    const brief = 'Audio and narration: use a warm, conversational delivery throughout.';
    assert.equal(extractExplicitNarration(brief), '');
  });
  it('collects multiple explicit lines in document order', () => {
    const brief = `Scene 1: the host greets the camera. Voiceover: "Welcome back!"
Scene 2: the host holds up the product. Dialogue: "This is the one."`;
    assert.equal(extractExplicitNarration(brief), 'Welcome back! This is the one.');
  });
  it('returns empty for a brief with no explicit narration at all, leaving the generic-template fallback to kick in', () => {
    assert.equal(extractExplicitNarration('Create a 15-second product teaser for a new coffee maker.'), '');
  });
  it('treats "None." the same as parsePresentationScript does — not a real line to speak', () => {
    assert.equal(extractExplicitNarration('Scene: the logo holds. Voiceover: "None."'), '');
  });
});
