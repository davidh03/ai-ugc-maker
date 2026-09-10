const SAMPLE_RATE = 44100;

// Builds ffmpeg args that concatenate per-scene voiceover clips (in order)
// into one track, inserting true silence for scenes that have no narration
// (e.g. a narration-free outro). Segments are normalized to a common sample
// rate/channel layout first — providers don't all encode mp3 the same way,
// and the concat filter (unlike the concat demuxer) requires matching
// formats across every input it stitches together.
//
// An optional `tempo` (from resolveSoftCapTempo) applies a single uniform
// atempo pass after the concat — scaling playback speed rather than cutting
// audio, so every scene's relative timing (and its sync to the visuals)
// stays intact even when the whole track gets nudged faster.
export function buildAudioConcatPlan(segments, outputPath, { tempo = 1 } = {}) {
  if (!segments?.length) throw new Error('buildAudioConcatPlan requires at least one segment');
  const clampedTempo = Math.min(2, Math.max(0.5, Number(tempo) || 1));
  const args = ['-y'];
  segments.forEach(segment => {
    if (segment.silence) args.push('-f', 'lavfi', '-t', String(Math.max(0.05, Number(segment.durationSec) || 0)), '-i', `anullsrc=r=${SAMPLE_RATE}:cl=stereo`);
    else args.push('-i', segment.path);
  });
  const normalized = segments.map((_, index) => `[${index}:a]aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=stereo[a${index}]`);
  const concatLabel = clampedTempo !== 1 ? 'concatenated' : 'out';
  const concatChain = `${segments.map((_, index) => `[a${index}]`).join('')}concat=n=${segments.length}:v=0:a=1[${concatLabel}]`;
  const tempoChain = clampedTempo !== 1 ? `;[${concatLabel}]atempo=${clampedTempo}[out]` : '';
  args.push('-filter_complex', `${normalized.join(';')};${concatChain}${tempoChain}`, '-map', '[out]', outputPath);
  return { args };
}
