// A soft cap on voiceover-driven duration: natural narration length always
// wins (see SYNC-FIRST TIMING OVERRIDE in the brief contract) unless it runs
// well past what the user asked for, in which case we nudge the whole track
// faster rather than truncating it — cutting audio would chop off words and
// desync every scene after the cut; a uniform tempo change keeps every
// scene's relative timing (and its sync to the visuals) intact.
const DEFAULT_TOLERANCE_RATIO = 1.15; // up to 15% over target: leave it alone
const DEFAULT_MAX_TEMPO = 1.25; // never speed speech up more than 25%

// Returns an ffmpeg atempo multiplier: 1 means "no change". Only engages
// once the natural duration is more than toleranceRatio over the target, and
// even then only pulls it back as far as maxTempo allows — this is a soft
// stop, not a guarantee of hitting the target exactly.
export function resolveSoftCapTempo(naturalDurationSec, targetDurationSec, { toleranceRatio = DEFAULT_TOLERANCE_RATIO, maxTempo = DEFAULT_MAX_TEMPO } = {}) {
  const natural = Number(naturalDurationSec);
  const target = Number(targetDurationSec);
  if (!Number.isFinite(natural) || natural <= 0 || !Number.isFinite(target) || target <= 0) return 1;
  const overrunRatio = natural / target;
  if (overrunRatio <= toleranceRatio) return 1;
  return Math.min(overrunRatio, maxTempo);
}
