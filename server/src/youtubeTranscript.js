// youtubeTranscript.js — Node-native YouTube transcript extraction.
//
// Detects standard YouTube URLs inside a job brief, fetches the video's
// captions when available, and injects the transcript text back into the
// brief so the composer has real content to work from.
//
// Design constraints honoured here:
//  - Node-native only: uses global fetch (Node 22+). No npm deps, no secrets,
//    no shell/spawn — the video id is extracted with a regex and passed to
//    fetch as a plain URL, so there is no shell-injection surface.
//  - Best-effort: every network path returns null / a warning instead of
//    throwing, so a missing or blocked transcript can never crash the job.
//  - Testable: fetch and the enabled flag are injectable via `opts`.

const ID = '[A-Za-z0-9_-]{11}';
// Common YouTube URL forms. The negative lookahead stops a 12th id char from
// being swallowed (e.g. "watch?v=ABCDEFGHIJK&t=30").
const URL_FORMS = [
  // watch?v=ID — the `?` after "watch" is consumed, then v= may be the first
  // param or appear later (e.g. ?t=5&v=ID).
  new RegExp(`youtube\\.com/watch\\?(?:[^#\\s"'<>]*[?&])?v=(${ID})(?![A-Za-z0-9_-])`),
  new RegExp(`youtu\\.be/(${ID})(?![A-Za-z0-9_-])`),
  new RegExp(`youtube\\.com/(?:shorts|embed|live|v)/(${ID})(?![A-Za-z0-9_-])`),
];
// Standalone bare 11-char id (e.g. a user pastes just "dQw4w9WgXcQ").
const BARE_ID = new RegExp(`(?:^|[\\s"'\\[(])(${ID})(?=$|[\\s"'\\])])`);

const WATCH_URL = 'https://www.youtube.com/watch?v=';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_TRANSCRIPT_CHARS = 4000;

/**
 * Extract the 11-char YouTube video id from arbitrary text, or null.
 * Supports watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/, and a
 * standalone bare id.
 */
export function extractVideoId(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  for (const re of URL_FORMS) {
    const m = text.match(re);
    if (m) return m[1];
  }
  const bare = text.match(BARE_ID);
  return bare ? bare[1] : null;
}

// Extract the `ytInitialPlayerResponse = {...};` JSON object from the watch
// page using brace matching (handles nested braces and quoted braces).
function extractPlayerResponse(html) {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const brace = html.indexOf('{', idx);
  if (brace === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(brace, i + 1); }
  }
  return null;
}

function parseCaptionTracks(html) {
  const json = extractPlayerResponse(html);
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null;
  } catch {
    return null;
  }
}

function pickTrack(tracks, lang) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const preferred =
    tracks.find((t) => t.languageCode === lang) ||
    tracks.find((t) => (t.languageCode || '').startsWith(lang + '-')) ||
    tracks[0];
  return preferred && typeof preferred.baseUrl === 'string' ? preferred : null;
}

function toVttUrl(baseUrl) {
  return baseUrl.includes('fmt=')
    ? baseUrl.replace(/fmt=[^&]*/, 'fmt=vtt')
    : baseUrl + '&fmt=vtt';
}

function decodeEntities(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function parseVtt(vtt) {
  const lines = vtt.split(/\r?\n/);
  const text = [];
  let inCue = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('WEBVTT') || line.startsWith('NOTE') ||
        line.startsWith('Kind:') || line.startsWith('Language:')) {
      continue;
    }
    if (line.includes('-->')) {
      inCue = true;
      continue;
    }
    if (inCue) {
      const clean = decodeEntities(line);
      if (clean) text.push(clean);
    }
  }
  const joined = text.join(' ').replace(/\s+/g, ' ').trim();
  return joined || null;
}

/**
 * Fetch the transcript (caption text) for a video id. Returns a string on
 * success, or null when the video has no captions or the network fails.
 * `opts.fetchImpl` injects a fetch implementation for tests.
 */
export async function fetchTranscript(videoId, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!videoId || typeof fetchImpl !== 'function') return null;
  const lang = opts.lang || 'en';
  try {
    const htmlRes = await fetchImpl(WATCH_URL + videoId, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!htmlRes.ok) return null;
    const html = await htmlRes.text();
    const tracks = parseCaptionTracks(html);
    const track = pickTrack(tracks, lang);
    if (!track) return null;
    const vttRes = await fetchImpl(toVttUrl(track.baseUrl), {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!vttRes.ok) return null;
    return parseVtt(await vttRes.text());
  } catch {
    return null;
  }
}

function isDisabled(opts) {
  if (typeof opts.transcriptsEnabled === 'boolean') {
    return !opts.transcriptsEnabled;
  }
  return String(process.env.TRANSCRIPTS_ENABLED ?? 'true').toLowerCase() === 'false';
}

/**
 * Enrich a brief that references a YouTube video by appending its transcript.
 * Never throws. Returns `{ brief, meta }` where `meta` describes what happened
 * (`detected`, `videoId`, `transcriptFetched`, `transcriptChars`, `warning`).
 */
export async function enrichBrief(brief, opts = {}) {
  const meta = { detected: false };
  const videoId = extractVideoId(brief);
  if (!videoId) return { brief, meta };

  meta.detected = true;
  meta.videoId = videoId;
  meta.transcriptFetched = false;
  meta.warning = null;

  if (isDisabled(opts)) {
    meta.warning = 'transcripts disabled (TRANSCRIPTS_ENABLED=false)';
    return { brief, meta };
  }

  const transcript = await fetchTranscript(videoId, opts);
  if (!transcript) {
    meta.warning = 'no transcript available (captions disabled or fetch failed)';
    return { brief, meta };
  }

  const capped = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  meta.transcriptFetched = true;
  meta.transcriptChars = capped.length;
  return {
    brief: brief + '\n\n--- YouTube transcript (' + videoId + ') ---\n' + capped,
    meta,
  };
}
