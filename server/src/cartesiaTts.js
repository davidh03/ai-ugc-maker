const CARTESIA_TTS_URL = process.env.CARTESIA_TTS_URL || 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2026-08-14';
const MAX_SCRIPT_CHARS = 6000;

export function voiceoverScriptFromBrief(brief = '') {
  return String(brief).replace(/https?:\/\/[^\s"'<>]+/gi, '').replace(/---[\s\S]*?---/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SCRIPT_CHARS);
}

export async function synthesizeCartesiaVoiceover(text, outputPath, { apiKey = process.env.CARTESIA_API_KEY, model = 'sonic-3', voiceId = 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', language = 'en', fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('Cartesia TTS is enabled but CARTESIA_API_KEY is not configured');
  const script = voiceoverScriptFromBrief(text);
  if (!script) throw new Error('Cartesia TTS received an empty voiceover script');
  const response = await fetchImpl(CARTESIA_TTS_URL, {
    method: 'POST',
    headers: { 'Cartesia-Version': CARTESIA_VERSION, authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model_id: model, transcript: script, voice: { id: voiceId }, output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 }, language }),
  });
  if (!response.ok) throw new Error(`Cartesia TTS request failed with HTTP ${response.status}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return { provider: 'cartesia-tts', model, voice: voiceId, script, outputPath };
}
