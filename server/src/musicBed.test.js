import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { generateMusicBed, detectMood } from './musicBed.js';
const file = '/tmp/ai-ugc-music-test.wav';
describe('generateMusicBed', () => {
  it('writes a duration-aware WAV with musical metadata', () => { const meta = generateMusicBed(file, 2, 'job-a'); assert.equal(meta.durationSec, 2); assert.ok(meta.bpm >= 96 && meta.bpm <= 112); assert.equal(meta.progression.length, 4); assert.ok(existsSync(file)); assert.equal(readFileSync(file).subarray(0, 4).toString(), 'RIFF'); assert.ok(statSync(file).size > 50000); unlinkSync(file); });
  it('changes the musical direction for different vibes', () => { const energetic = generateMusicBed(file, 1, 'same', 'bold energetic launch'); const calm = generateMusicBed(file, 1, 'same', 'soft calm meditation'); assert.notEqual(energetic.mood, calm.mood); assert.notDeepEqual(energetic.progression, calm.progression); unlinkSync(file); });
  it('maps prompt language to a musical mood', () => { assert.equal(detectMood('A bold energetic launch with fast action').name, 'energetic'); });
});
