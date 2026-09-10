const PATTERNS = [
  [/\b(background|color|colour|visual|design|font|layout|scene|camera|animation|look)\b/i, 'visual.design'],
  [/\b(asset|image|clip|logo|screenshot|upload)\b/i, 'asset.replace'],
  [/\b(narrat|script|sentence|wording|say|spoken|line)\b/i, 'narration.text'],
  [/\b(voice|speaker|accent|male|female|trustworthy|calm|energetic)\b/i, 'narration.voice'],
  [/\b(music|song|bed|soundtrack|audio bed)\b/i, 'music.track'],
  [/\b(duration|shorten|lengthen|pace|pacing|timing|faster|slower)\b/i, 'timing.scene'],
  [/\b(caption|subtitle|on-screen text|cta|call to action)\b/i, 'caption.text']
];

function explicitlyPreserved(text, id) {
  if (id === 'narration.voice') return /\b(keep|preserve|leave)\b.{0,35}\b(voice|speaker)\b|\b(voice|speaker)\b.{0,20}\b(unchanged|same)\b/i.test(text);
  if (id === 'narration.text') return /\b(keep|preserve|leave)\b.{0,35}\b(narrat|script|wording)\b|\b(narrat|script)\b.{0,20}\b(unchanged|same)\b/i.test(text);
  if (id === 'music.track') return /\b(keep|preserve|leave)\b.{0,35}\b(music|soundtrack|bed)\b|\b(music|soundtrack)\b.{0,20}\b(unchanged|same)\b/i.test(text);
  if (id === 'timing.scene') return /\b(keep|preserve|leave)\b.{0,35}\b(timing|duration|scene order)\b|\b(timing|duration|scene order)\b.{0,20}\b(unchanged|same)\b/i.test(text);
  return false;
}

export function analyzeRevisionIntent(instruction = '') {
  const text = String(instruction).trim();
  if (!text) throw new Error('revision instruction is required');
  const targets = [...text.matchAll(/\bscene\s*(?:number\s*)?(\d+)\b/gi)].map(match => Number(match[1])).filter(Boolean);
  const factors = [];
  for (const [pattern, id] of PATTERNS) {
    const factorId = id === 'visual.design' && targets.length ? 'visual.scene' : id;
    if (!explicitlyPreserved(text, id) && pattern.test(text) && !factors.some(f => f.id === factorId)) {
      factors.push({ id: factorId, targets, source: 'instruction', operation: /\b(replace|change|remove|add|swap|shorten|lengthen)\b/i.test(text) ? 'change' : 'adjust', evidence: text, confidence: 0.72 });
    }
  }
  if (!factors.length) factors.push({ id: 'brief.content', source: 'instruction', operation: 'change', evidence: text, confidence: 0.45, status: 'needs-review' });
  return {
    schemaVersion: 1,
    factors,
    preserve: /\b(keep|preserve|unchanged|don't change|do not change)\b/i.test(text) ? ['all unspecified content'] : [],
    ambiguities: factors.some(f => f.confidence < 0.6) ? ['The requested change is broad; review the affected factors before rendering.'] : [],
    analyzer: { provider: 'local-heuristic', model: 'rule-based', schemaVersion: 1 }
  };
}
