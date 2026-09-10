function timeToSeconds(value) {
  const match = String(value).trim().match(/^(\d+):(\d{2})(?:\.(\d+))?$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`) : null;
}

export function parseTimecode(value) {
  const match = String(value).match(/(\d+:\d{2}(?:\.\d+)?)\s*[–-]\s*(\d+:\d{2}(?:\.\d+)?)/);
  if (!match) return null;
  const startSec = timeToSeconds(match[1]); const endSec = timeToSeconds(match[2]);
  return startSec !== null && endSec !== null && endSec > startSec ? { startSec, endSec } : null;
}

function section(block, name, nextNames) {
  const start = block.search(new RegExp(`(?:^|\n)${name}\\s*:?\\s*\n`, 'i'));
  if (start < 0) return '';
  const marker = block.slice(start).match(new RegExp(`${name}\\s*:?\\s*\n`, 'i'));
  if (!marker) return '';
  const bodyStart = start + marker[0].length;
  const rest = block.slice(bodyStart);
  const boundary = nextNames.join('|');
  const next = rest.search(new RegExp(`\n(?:${boundary})\\s*:?\\s*(?:\n|$)`, 'i'));
  return (next >= 0 ? rest.slice(0, next) : rest).replace(/\n+/g, ' ').trim();
}

function cleanVoiceover(value) {
  const text = String(value || '').replace(/[“”]/g, '"').trim();
  return /^none(?:[.!]?|\s*\([^)]*\))$/i.test(text) ? '' : text;
}

// Pulls out explicitly quoted spoken lines from a brief that ISN'T a full
// Scene/Timecode script (parsePresentationScript handles that case). Briefs
// often bury a single "Narration/dialogue:" or "Voiceover:" label mid-bullet
// rather than in the strict per-scene format — e.g. "...reacting in
// surprise. Narration/dialogue: "Line to speak." Deliver the line as..." —
// so the label is matched anywhere in the text, not just at a line start.
// Only *quoted* text counts as a line to speak; an unquoted label match
// (e.g. "Audio and narration: use a playful delivery") is a direction about
// narration, not narration itself, and is correctly ignored.
export function extractExplicitNarration(brief = '') {
  const text = String(brief).replace(/\r/g, '');
  const labelRe = /\b(?:Voiceover|Narration(?:\/dialogue)?|Dialogue)\s*:\s*/gi;
  const boundaryRe = /\n\s*\n|\n[ \t]*(?:[-*]\s*)?[A-Z][a-zA-Z /]*:/;
  const lines = [];
  let match;
  while ((match = labelRe.exec(text))) {
    const rest = text.slice(match.index + match[0].length);
    const boundary = rest.search(boundaryRe);
    const segment = boundary >= 0 ? rest.slice(0, boundary) : rest;
    const quoted = segment.match(/["“]([^"”]+)["”]/);
    const line = quoted ? cleanVoiceover(quoted[1]) : '';
    if (line) lines.push(line);
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}


export function parsePresentationScript(input = '') {
  const text = String(input).replace(/\r/g, ' ');
  const headers = [...text.matchAll(/(^|\n)([^\n]+)\n\s*Timecode:\s*([^\n]+)/gi)];
  const scenes = headers.map((header, index) => {
    const start = header.index + header[1].length; const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(start, end); const timing = parseTimecode(header[3]);
    if (!timing) return null;
    const voiceover = cleanVoiceover(section(block, 'Voiceover', ['Visual', 'On Screen', 'On[- ]screen(?:\\s+text)?', 'Voiceover', 'Audio', 'Overall visual direction', 'Use', 'Avoid']));
    const visual = section(block, 'Visual', ['On Screen', 'Voiceover', 'Visual']);
    const onScreen = block.match(/(?:^|\n)On[- ]screen(?:\s+text)?\s*:\s*(?:\n\s*)?([^\n]+)/i)?.[1]?.trim() || '';
    // A narration-free scene (e.g. "Voiceover: None." on a logo outro) is
    // still a real scene with its own timecode-derived duration — keep it
    // so downstream duration/timing math doesn't silently lose that time.
    return { title: header[2].trim(), ...timing, visual, onScreen, voiceover: voiceover ? voiceover.replace(/[“”]/g, '"') : '' };
  }).filter(Boolean);
  return { scenes, script: scenes.map(scene => scene.voiceover).join(' ').replace(/\s+/g, ' ').trim(), detected: scenes.length > 0 };
}

// Rebuild a scene list's start/end timecodes from measured, real per-scene
// audio durations instead of the brief's estimated timecodes — durations[i]
// is the real length (seconds) of scenes[i]'s recorded voiceover, or a
// chosen silent-hold length when the scene has none. This is what makes cut
// points land where each line is actually spoken instead of a guess.
export function applyMeasuredSceneDurations(scenes, durations) {
  let cursor = 0;
  return scenes.map((scene, index) => {
    const durationSec = Math.max(0, Number(durations[index]) || 0);
    const startSec = cursor; const endSec = cursor + durationSec;
    cursor = endSec;
    return { ...scene, id: `scene${index + 1}`, startSec, endSec, durationSec };
  });
}

export function narrationPlanPrompt(plan) {
  if (!plan?.detected) return '';
  const base = `APPROVED NARRATION AND TIMED SCENES (do not rewrite the voiceover): ${JSON.stringify(plan.scenes)}.`;
  if (plan.timingSource === 'measured') {
    return `${base} These startSec/endSec values are the REAL measured length of the already-recorded voiceover for each scene, not an estimate — the audio and its silences were rendered before this composition. Set each scene's data-start and data-duration to match its startSec/endSec exactly (within 0.05s). Do not compress, expand, round, or re-estimate them, and keep the spoken lines in this exact order.`;
  }
  return `${base} Pace each visual reveal to the matching scene's startSec/endSec and keep the spoken lines in this exact order.`;
}
