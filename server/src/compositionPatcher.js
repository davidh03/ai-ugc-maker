function sceneBlock(html, sceneNumber) {
  const marker = `id="scene${sceneNumber}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.lastIndexOf('<div', markerIndex);
  if (start < 0) return null;
  const openEnd = html.indexOf('>', markerIndex);
  if (openEnd < 0) return null;
  const token = /<\/?div\b[^>]*>/gi;
  token.lastIndex = openEnd + 1;
  let depth = 1;
  let match;
  while ((match = token.exec(html))) {
    if (/^<\/div/i.test(match[0])) depth -= 1; else depth += 1;
    if (depth === 0) return { start, end: token.lastIndex, html: html.slice(start, token.lastIndex) };
  }
  return null;
}

function elementBlock(html, sourceId) {
  const escaped = String(sourceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const open = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>`, 'i').exec(html);
  if (!open) return null;
  const tag = open[1]; const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'); token.lastIndex = open.index + open[0].length;
  let depth = 1; let match;
  while ((match = token.exec(html))) { if (match[0].startsWith('</')) depth -= 1; else depth += 1; if (depth === 0) return { start: open.index, end: token.lastIndex, html: html.slice(open.index, token.lastIndex) }; }
  return null;
}

function nestedTargetBlock(html, sourceId) {
  const escaped = String(sourceId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match either an id="..." or a class="..." (the first attribute) that contains the term.
  const attr = new RegExp(`(?:id|class)=["']${escaped}["']`, 'i').exec(html);
  if (!attr) return null;
  const openStart = html.lastIndexOf('<', attr.index);
  if (openStart < 0) return null;
  const tagNameMatch = /^<([a-z][a-z0-9-]*)/i.exec(html.slice(openStart));
  if (!tagNameMatch) return null;
  const tagName = tagNameMatch[1].toLowerCase();
  if (['img','video','audio','source','br','meta','link'].includes(tagName)) {
    const close = html.indexOf('>', attr.index) + 1;
    return { start: openStart, end: close, html: html.slice(openStart, close) };
  }
  const tagEnd = html.indexOf('>', openStart);
  if (tagEnd < 0) return null;
  const token = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi'); token.lastIndex = tagEnd + 1;
  let depth = 1; let match;
  while ((match = token.exec(html))) { if (match[0].startsWith('</')) depth -= 1; else depth += 1; if (depth === 0) return { start: openStart, end: token.lastIndex, html: html.slice(openStart, token.lastIndex) }; }
  return null;
}

function bindAsset(blockHtml, binding) {
  const rel = `assets/${binding.filename}`;
  const media = /(<(?:img|video)\b[^>]*\bsrc=["'])([^"']+)(["'])/i;
  if (media.test(blockHtml)) return blockHtml.replace(media, `$1${rel}$3`);
  const close = blockHtml.lastIndexOf('</');
  if (close < 0) return null;
  const style = binding.targetKind === 'operator-person' ? 'position:relative;z-index:3;max-width:115%;max-height:115%;object-fit:contain;filter:drop-shadow(0 18px 24px rgba(0,0,0,.28));transform:scale(1.06);' : 'max-width:100%;max-height:100%;object-fit:contain;';
  return blockHtml.slice(0, close) + `<img data-revision-asset="${binding.assetId}" src="${rel}" alt="" style="${style}">` + blockHtml.slice(close);
}

function colorValue(name) { return { blue: '#3b82f6', purple: '#8b72ff', red: '#ef4444', green: '#22c55e', orange: '#f97316', white: '#ffffff', black: '#000000' }[name.toLowerCase()]; }

export function patchComposition(sourceHtml, job = {}) {
  const context = job.revisionContext || {};
  const factors = context.factors || [];
  const scenes = [...new Set(context.targetScenes || factors.flatMap(f => f.targets || []))];
  if (!sourceHtml) return { changed: false, html: sourceHtml, reason: 'Source composition unavailable' };
  let html = sourceHtml;
  const changes = [];
  for (const binding of job.assetBindings || []) {
    const block = elementBlock(html, binding.sourceId) || nestedTargetBlock(html, binding.sourceId);
    if (!block) return { changed: false, html: sourceHtml, reason: `Target ${binding.sourceId} was not found` };
    const next = bindAsset(block.html, binding);
    if (!next) return { changed: false, html: sourceHtml, reason: `Target ${binding.sourceId} cannot accept media` };
    html = html.slice(0, block.start) + next + html.slice(block.end);
    changes.push(`${binding.targetKind} asset`);
  }
  if (!scenes.length) return changes.length ? { changed: true, html, changes, reason: 'Applied deterministic target bindings' } : { changed: false, html: sourceHtml, reason: 'No explicit scene target' };
  for (const scene of scenes) {
    const block = sceneBlock(html, scene);
    if (!block) return { changed: false, html: sourceHtml, reason: `Scene ${scene} was not found` };
    let next = block.html;
    if (factors.some(f => f.id === 'asset.replace') && !(job.assetBindings || []).length) {
      const newAsset = (job.assets || []).find(asset => asset.path && !(context.parentAssetPaths || []).includes(asset.path));
      if (!newAsset) return { changed: false, html: sourceHtml, reason: 'No new asset available for deterministic replacement' };
      const srcPattern = /(<(?:img|video)\b[^>]*\bsrc=["'])([^"']+)(["'])/i;
      if (!srcPattern.test(next)) return { changed: false, html: sourceHtml, reason: `No media source found in Scene ${scene}` };
      next = next.replace(srcPattern, `$1assets/${newAsset.filename}$3`);
      changes.push(`Scene ${scene} asset`);
    }
    const textRequest = String(context.instruction || '').match(/(?:replace|change)\s+(?:the\s+)?(?:headline|title|text|caption|cta|label)[^\n]{0,80}?\s(?:to|with)\s+["“]([^"”]+)["”]/i);
    if (textRequest && factors.some(f => f.id === 'caption.text')) {
      const textNode = />([^<>]{3,})</.exec(next);
      if (!textNode) return { changed: false, html: sourceHtml, reason: `No safe text target found in Scene ${scene}` };
      next = next.replace(textNode[0], `>${textRequest[1]}<`);
      changes.push(`Scene ${scene} text`);
    }
    const colorRequest = String(context.instruction || '').match(/(?:background|accent|primary)\s+(?:color\s+)?(?:to|as)\s+(blue|purple|red|green|orange|white|black)\b/i);
    if (colorRequest && factors.some(f => f.id === 'visual.design')) {
      const colorPattern = /(#[0-9a-f]{6}|rgba?\([^)]*\))/i;
      if (!colorPattern.test(next)) return { changed: false, html: sourceHtml, reason: `No safe style target found in Scene ${scene}` };
      next = next.replace(colorPattern, colorValue(colorRequest[1]));
      changes.push(`Scene ${scene} style`);
    }
    html = html.slice(0, block.start) + next + html.slice(block.end);
  }
  return changes.length ? { changed: true, html, changes, reason: 'Applied deterministic scene patch' } : { changed: false, html: sourceHtml, reason: 'No deterministic operation matched' };
}
