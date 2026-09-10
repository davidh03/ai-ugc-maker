function attrs(tag) {
  const read = name => tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
  const startValue = read('data-start'); const durationValue = read('data-duration');
  return { id: read('id'), className: read('class'), dataName: read('data-name'), start: startValue === '' ? Number.NaN : Number(startValue), duration: durationValue === '' ? Number.NaN : Number(durationValue) };
}
function elements(html) { return [...String(html).matchAll(/<(?:div|section|main)\b[^>]*>/gi)].map(match => ({ ...attrs(match[0]), index: match.index, tag: match[0] })); }
function normalized(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function sourceId(element, fallback) { return element?.id || element?.dataName || fallback; }
function nearestTimed(items, position) { return items.filter(x => Number.isFinite(x.start) && x.index <= position).sort((a,b) => b.index-a.index)[0]; }
function semanticElement(items, terms) { return items.find(x => terms.some(term => `${x.id} ${x.className} ${x.dataName}`.toLowerCase().includes(term))); }

function nearestScopedAnchor(items, position, terms) {
  // Find the most recent ancestor container whose child text matches a term.
  let best = null;
  for (const item of items) {
    if (item.index > position) continue;
    const text = `${item.id} ${item.className} ${item.dataName}`.toLowerCase();
    if (terms.some(term => text.includes(term)) && (!best || item.index > best.index)) best = item;
  }
  return best;
}
export function resolveRevisionTargets(instruction = '', html = '', requestedDuration = 0) {
  const text = String(instruction); const lower = text.toLowerCase(); const items = elements(html); const timed = items.filter(x => Number.isFinite(x.start)); const targets = [];
  const add = (kind, element, extra = {}) => { const id = sourceId(element, kind); if (!targets.some(x => x.kind === kind && x.sourceId === id)) targets.push({ id: `target-${kind}`, kind, sourceId: id, ...extra }); };
  for (const match of text.matchAll(/\bscene\s*(?:number\s*)?(\d+)\b/gi)) { const n = Number(match[1]); const el = items.find(x => normalized(x.id) === `scene${n}` || normalized(x.dataName) === `scene${n}`); if (el) add('scene', el, { scene: n, timeRange: [el.start, el.start + el.duration] }); }
  if (/\b(outro|ending|end card|final (?:frame|card|logo)|last frame)\b/i.test(text)) { const el = semanticElement(items, ['outro','closing','finale','end-card']) || nearestScopedAnchor(items, html.length, ['outro','closing','finale','end-card']) || [...timed].sort((a,b) => b.start-a.start)[0]; const timing = el && Number.isFinite(el.start) ? el : nearestTimed(timed, el?.index ?? html.length); if (el) add('outro', el, { timeRange: [timing?.start ?? requestedDuration, Number.isFinite(timing?.duration) ? timing.start + timing.duration : requestedDuration] }); }
  if (/(top[- ]?left|header|brand mark|next to).{0,50}\b(logo|brand)\b|\b(logo|brand).{0,50}(top[- ]?left|header|next to)/i.test(text)) { const el = semanticElement(items, ['brand-pill','brand','header','nav','logo']) || [...timed].sort((a,b)=>a.start-b.start)[0]; if (el) add('header-logo', el); }
  if (/\b(operator|girl|woman|person|human)\b/i.test(text)) { const positions = ['operator','girl','woman','person','human'].map(word => lower.indexOf(word)).filter(x=>x>=0); const el = semanticElement(items, ['operator','person','human','agent']) || nearestScopedAnchor(items, Math.min(...positions), ['operator','person','human','agent']) || nearestTimed(timed, Math.min(...positions)); const timing = el && Number.isFinite(el.start) ? el : nearestTimed(timed, el?.index ?? Math.min(...positions)); if (el) add('operator-person', el, { timeRange: [timing?.start, Number.isFinite(timing?.duration) ? timing.start + timing.duration : requestedDuration] }); }
  return targets;
}
