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
    return voiceover ? { title: header[2].trim(), ...timing, visual, onScreen, voiceover: voiceover.replace(/[“”]/g, '"') } : null;
  }).filter(Boolean);
  return { scenes, script: scenes.map(scene => scene.voiceover).join(' ').replace(/\s+/g, ' ').trim(), detected: scenes.length > 0 };
}

export function narrationPlanPrompt(plan) {
  return plan?.detected ? `APPROVED NARRATION AND TIMED SCENES (do not rewrite the voiceover): ${JSON.stringify(plan.scenes)}. Pace each visual reveal to the matching scene's startSec/endSec and keep the spoken lines in this exact order.` : '';
}
