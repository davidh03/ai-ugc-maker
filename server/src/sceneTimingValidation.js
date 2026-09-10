function parseAttrs(openTag) {
  const attrs = {};
  const re = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(openTag))) attrs[match[1]] = match[2];
  return attrs;
}

// Reads back the data-start/data-duration the composer actually wrote for
// each `class="clip"` element, regardless of attribute order (the composer
// is an LLM-authored file, not a fixed template).
export function extractClipTimings(html) {
  const tagRe = /<[a-z][a-z0-9-]*\b[^>]*\bclass="[^"]*\bclip\b[^"]*"[^>]*>/gi;
  const clips = [];
  let match;
  while ((match = tagRe.exec(String(html)))) {
    const attrs = parseAttrs(match[0]);
    const startSec = Number(attrs['data-start']);
    const durationSec = Number(attrs['data-duration']);
    if (attrs.id && Number.isFinite(startSec) && Number.isFinite(durationSec)) {
      clips.push({ id: attrs.id, startSec, durationSec, endSec: startSec + durationSec });
    }
  }
  return clips;
}

// Compares the composer's rendered clip timings against the required, real
// (measured-from-audio) scene timings. Non-blocking by design — callers
// should log/store the result, not fail the job on a mismatch.
export function validateSceneTimings(html, sceneTimings, toleranceSec = 0.4) {
  const actualById = new Map(extractClipTimings(html).map(clip => [clip.id, clip]));
  const mismatches = [];
  (sceneTimings || []).forEach((scene, index) => {
    const id = scene.id || `scene${index + 1}`;
    const actual = actualById.get(id);
    if (!actual) { mismatches.push({ id, issue: 'missing-in-render' }); return; }
    const startDrift = Math.abs(actual.startSec - scene.startSec);
    const durationDrift = Math.abs(actual.durationSec - scene.durationSec);
    if (startDrift > toleranceSec || durationDrift > toleranceSec) {
      mismatches.push({ id, expectedStart: scene.startSec, actualStart: actual.startSec, expectedDuration: scene.durationSec, actualDuration: actual.durationSec, startDrift, durationDrift });
    }
  });
  return { passed: mismatches.length === 0, mismatches };
}
