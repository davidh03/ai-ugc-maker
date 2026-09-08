const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_SCRIPT_CHARS = 6000;

export function voiceoverScriptFromBrief(brief = '') {
  return String(brief).replace(/https?:\/\/[^\s"'<>]+/gi, '').replace(/---[\s\S]*?---/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SCRIPT_CHARS);
}

export async function synthesizeGoogleVoiceover(text, outputPath, { apiKey = process.env.GOOGLE_TTS_API_KEY, languageCode = 'en-US', voiceName = 'en-US-Neural2-F', speakingRate = 1, fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('Google TTS is enabled but GOOGLE_TTS_API_KEY is not configured');
  const script = voiceoverScriptFromBrief(text);
  if (!script) throw new Error('Google TTS received an empty voiceover script');
  const response = await fetchImpl(`${GOOGLE_TTS_URL}?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { text: script }, voice: { languageCode, name: voiceName }, audioConfig: { audioEncoding: 'MP3', speakingRate } }) });
  if (!response.ok) throw new Error(`Google TTS request failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.audioContent) throw new Error('Google TTS returned no audio');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, Buffer.from(payload.audioContent, 'base64'));
  return { provider: 'google-cloud-tts', voiceName, languageCode, script, outputPath };
}
