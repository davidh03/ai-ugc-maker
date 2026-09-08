const MINIMAX_TTS_URL = process.env.MINIMAX_TTS_URL || 'https://api.minimax.io/v1/t2a_v2';
const MAX_SCRIPT_CHARS = 9000;

export function voiceoverScriptFromBrief(brief = '') {
  return String(brief).replace(/https?:\/\/[^\s"'<>]+/gi, '').replace(/---[\s\S]*?---/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SCRIPT_CHARS);
}

export async function synthesizeMiniMaxVoiceover(text, outputPath, { apiKey = process.env.MINIMAX_API_KEY, model = 'speech-2.8-hd', voiceId = 'English_expressive_narrator', speed = 1, emotion = 'neutral', fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('MiniMax TTS is enabled but MINIMAX_API_KEY is not configured');
  const script = voiceoverScriptFromBrief(text);
  if (!script) throw new Error('MiniMax TTS received an empty voiceover script');
  const response = await fetchImpl(MINIMAX_TTS_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, text: script, stream: false, voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0, emotion }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }, subtitle_enable: false, output_format: 'hex' }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.base_resp?.status_code) throw new Error(`MiniMax TTS request failed with HTTP ${response.status}${payload.base_resp?.status_msg ? `: ${payload.base_resp.status_msg}` : ''}`);
  const audioHex = payload.data?.audio;
  if (!audioHex || !/^[0-9a-f]+$/i.test(audioHex)) throw new Error('MiniMax TTS returned no valid audio');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, Buffer.from(audioHex, 'hex'));
  return { provider: 'minimax-tts', model, voice: voiceId, script, outputPath, durationMs: payload.extra_info?.audio_length || null };
}
