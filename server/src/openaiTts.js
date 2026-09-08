const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_SCRIPT_CHARS = 6000;

export function voiceoverScriptFromBrief(brief = '') {
  return String(brief).replace(/https?:\/\/[^\s"'<>]+/gi, '').replace(/---[\s\S]*?---/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SCRIPT_CHARS);
}

export async function synthesizeOpenAIVoiceover(text, outputPath, { apiKey = process.env.OPENAI_API_KEY, model = 'gpt-4o-mini-tts', voice = 'coral', instructions = 'Speak naturally and conversationally, with warm UGC energy. Do not sound like an announcer.', fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) throw new Error('OpenAI TTS is enabled but OPENAI_API_KEY is not configured');
  const script = voiceoverScriptFromBrief(text);
  if (!script) throw new Error('OpenAI TTS received an empty voiceover script');
  const response = await fetchImpl(OPENAI_TTS_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, voice, input: script, instructions, response_format: 'mp3' }) });
  if (!response.ok) throw new Error(`OpenAI TTS request failed with HTTP ${response.status}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return { provider: 'openai-tts', model, voice, script, outputPath };
}
