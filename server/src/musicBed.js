import { writeFileSync } from 'node:fs';

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const NOTE = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440 };
const MOODS = {
  energetic: { words: ['energetic', 'bold', 'hype', 'fast', 'launch', 'action', 'sport', 'power'], bpm: 116, progression: [NOTE.D3, NOTE.G3, NOTE.A2, NOTE.F3], drive: 1.25 },
  luxury: { words: ['luxury', 'premium', 'elegant', 'high-end', 'expensive', 'sleek', 'minimal'], bpm: 82, progression: [NOTE.A2, NOTE.F3, NOTE.C3, NOTE.G3], drive: 0.7 },
  warm: { words: ['warm', 'coffee', 'morning', 'cozy', 'friendly', 'home', 'comfort', 'sun'], bpm: 96, progression: [NOTE.C3, NOTE.G3, NOTE.A2, NOTE.F3], drive: 0.82 },
  playful: { words: ['playful', 'fun', 'cute', 'colorful', 'happy', 'quirky', 'joy'], bpm: 108, progression: [NOTE.C3, NOTE.F3, NOTE.G3, NOTE.A2], drive: 1.1 },
  dark: { words: ['dark', 'dramatic', 'moody', 'mystery', 'serious', 'noir', 'intense'], bpm: 76, progression: [NOTE.A2, NOTE.G3, NOTE.F3, NOTE.E3], drive: 0.72 },
  calm: { words: ['calm', 'soft', 'peaceful', 'relax', 'meditation', 'gentle', 'slow'], bpm: 68, progression: [NOTE.F3, NOTE.C3, NOTE.G3, NOTE.A2], drive: 0.55 },
};

function hashSeed(seed = '') { return [...String(seed)].reduce((n, c) => ((n * 31) + c.charCodeAt(0)) >>> 0, 2166136261); }
function envelope(t, length, attack = 0.015, release = 0.12) { return Math.min(1, t / attack, (length - t) / release, 1); }
function tone(t, frequency, length, amp = 0.1) { return Math.sin(TAU * frequency * t) * amp * envelope(t, length); }
function writeWav(filePath, samples) { const data = Buffer.alloc(44 + samples.length * 2); data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 2, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(SAMPLE_RATE, 24); data.writeUInt32LE(SAMPLE_RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40); samples.forEach((sample, i) => data.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32767, 44 + i * 2)); writeFileSync(filePath, data); }

export function detectMood(brief = '') {
  const text = String(brief).toLowerCase(); let best = ['balanced', { words: [], bpm: 100, progression: [NOTE.A2, NOTE.F3, NOTE.C3, NOTE.G3], drive: 0.9 }]; let score = 0;
  for (const [name, mood] of Object.entries(MOODS)) { const hits = mood.words.filter(word => text.includes(word)).length; if (hits > score) { score = hits; best = [name, mood]; } }
  return { name: best[0], ...best[1] };
}

export function generateMusicBed(filePath, durationSec, seed = '', brief = '') {
  const duration = Math.max(1, Number(durationSec) || 1); const total = Math.ceil(duration * SAMPLE_RATE); const samples = new Float32Array(total); const seedValue = hashSeed(seed + brief); const mood = detectMood(brief); const bpm = mood.bpm + (hashSeed(seed + 'tempo') % 5) - 2; const beat = 60 / bpm; const chordLength = beat * 4;
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE; const beatIndex = Math.floor(t / beat); const beatTime = t % beat; const chord = mood.progression[Math.floor(t / chordLength) % mood.progression.length]; const bar = Math.floor(t / chordLength); const root = chord; const third = chord * 1.1892; const fifth = chord * 1.4983; let value = 0;
    value += tone(beatTime, root, beat, 0.075 * mood.drive) + tone(beatTime, third, beat, 0.045 * mood.drive) + tone(beatTime, fifth, beat, 0.035 * mood.drive);
    const arpNotes = [root * 2, third * 2, fifth * 2, root * 4]; value += tone(beatTime, arpNotes[(beatIndex + bar) % arpNotes.length], beat * 0.7, 0.07 * mood.drive);
    value += tone(t % (beat * 2), root, beat * 2, 0.12 * mood.drive);
    if (beatTime < 0.09) value += Math.sin(TAU * 65 * beatTime) * Math.exp(-beatTime * 35) * 0.22 * mood.drive;
    const half = t % (beat * 2) - beat; if (half >= 0 && half < 0.08) value += Math.sin(TAU * 180 * half) * Math.exp(-half * 55) * 0.09 * mood.drive;
    const hat = t % (beat / 2); const noise = (Math.sin((i + seedValue) * 12.9898) * 43758.5453) % 1; value += noise * Math.exp(-hat * 65) * 0.018 * mood.drive;
    samples[i] = Math.tanh(value * 1.4);
  }
  writeWav(filePath, samples); return { mood: mood.name, bpm, progression: mood.progression.map(freq => Math.round(freq * 100) / 100), durationSec: duration };
}
