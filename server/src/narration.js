const MAX_SCRIPT_CHARS = 6000;

function cleanBrief(value = '') {
  return String(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '')
    .replace(/---[\s\S]*?---/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentences(value) {
  return cleanBrief(value).split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
}

function firstMeaningful(value, fallback) {
  const parts = sentences(value);
  return parts[0] || cleanBrief(value) || fallback;
}

function shorten(value, max = 150) {
  const text = String(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}...`;
}

export function buildNarrationScript({ brief = '', style = 'product', durationSec = 15 } = {}) {
  const source = cleanBrief(brief);
  if (!source) return '';
  const parts = sentences(source);
  const subject = shorten(firstMeaningful(source, 'This is a better way to get things done.'));
  const detail = shorten(parts[1] || source, 170);
  const isLong = Number(durationSec) >= 25;

  let lines;
  if (style === 'explainer') {
    lines = isLong
      ? [`Let's break this down. ${subject}`, `The problem is simple: ${detail}`, `The better approach is to make the process clearer, faster, and easier to follow.`, `That's the idea. Less friction, better results.`]
      : [`Here's the idea. ${subject}`, `Instead of making this harder than it needs to be, use a simpler approach.`, `Clear, practical, and easy to follow.`];
  } else if (style === 'social') {
    lines = isLong
      ? [`Quick question: ${subject}`, `Here's why it matters. ${detail}`, `The result is a simpler way to move forward.`, `Save this one and give it a try.`]
      : [`Quick one: ${subject}`, `Less hassle. More momentum.`, `Give it a try.`];
  } else {
    lines = isLong
      ? [`Meet a better way to do this. ${subject}`, `${detail}`, `It is simple, useful, and built to keep things moving.`, `Ready to make the switch?`]
      : [`Meet a better way to do this. ${subject}`, `Simple, useful, and ready when you are.`];
  }

  return lines.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SCRIPT_CHARS);
}

export function narrationDirection(style = 'product') {
  if (style === 'explainer') return 'Natural explainer delivery. Sound clear, warm, and confident. Pause briefly between the problem and solution. Do not read like a commercial announcer.';
  if (style === 'social') return 'Natural social-video delivery. Sound direct, relaxed, and conversational. Keep the pace energetic but not rushed.';
  return 'Natural product-teaser delivery. Sound warm, conversational, and confident. Use a small pause before the final benefit or call to action.';
}
