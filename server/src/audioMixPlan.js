// Positive offsetSec pushes the voice later (silence prepended via adelay);
// negative pulls it earlier (leading audio trimmed via atrim). Both run before
// apad so the padding still lands after the shifted content, not before it.
function voiceOffsetFilter(offsetSec) {
  const sec = Number(offsetSec) || 0;
  if (!sec) return '';
  if (sec > 0) return `adelay=delays=${Math.round(sec * 1000)}:all=1,`;
  return `atrim=start=${Math.abs(sec)},asetpts=PTS-STARTPTS,`;
}

export function buildAudioMixPlan({ voiceover = false, music = false, uploadedMusic = false, durationSec, voiceoverOffsetSec = 0 }) {
  const duration = String(Number(durationSec));
  const offset = voiceOffsetFilter(voiceoverOffsetSec);
  if (voiceover && music) return { args: ['-y','-i','VIDEO','-stream_loop','-1','-i','MUSIC','-i','VOICE','-filter_complex',`[1:a]volume=0.18[bed];[2:a]${offset}apad=pad_dur=${duration}[voice];[bed][voice]amix=inputs=2:duration=longest:dropout_transition=2[a]`,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-t',duration] };
  if (voiceover) return { args: ['-y','-i','VIDEO','-i','VOICE','-filter_complex',`[1:a]${offset}apad=pad_dur=${duration}[a]`,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-t',duration] };
  if (music) return { args: ['-y','-i','VIDEO',...(uploadedMusic?['-stream_loop','-1']:[]),'-i','MUSIC','-filter_complex','[1:a]volume=1.0,lowpass=f=9000[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','128k','-t',duration] };
  return { args: [] };
}
export function materializeAudioMixArgs(plan, { videoPath, voiceoverPath, musicPath, outputPath }) { return plan.args.map(value => value === 'VIDEO' ? videoPath : value === 'VOICE' ? voiceoverPath : value === 'MUSIC' ? musicPath : value).concat(outputPath); }
