const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const MAX_URLS = 3;
const MAX_PAGE_CHARS = 12000;
const MAX_TOTAL_CHARS = 30000;
const TIMEOUT_MS = 15000;

function cleanUrl(raw) {
  try { return new URL(raw.replace(/[),.;!?]+$/, '')); } catch { return null; }
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === '0.0.0.0' || host === '::' || host.endsWith('.internal') || host.endsWith('.local')) return true;
  return false;
}

export function extractUrls(brief = '') {
  const seen = new Set(); const urls = [];
  for (const match of String(brief).matchAll(URL_RE)) {
    const url = cleanUrl(match[0]);
    if (!url || !['http:', 'https:'].includes(url.protocol) || isBlockedHostname(url.hostname)) continue;
    const normalized = url.toString();
    if (!seen.has(normalized)) { seen.add(normalized); urls.push(normalized); }
    if (urls.length >= MAX_URLS) break;
  }
  return urls;
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}
function pageTitle(html) { return String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''; }
function cap(text, limit) { return String(text || '').slice(0, limit).trim(); }

async function fetchPage(url, fetchImpl) {
  let current = url;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const parsed = cleanUrl(current);
    if (!parsed || isBlockedHostname(parsed.hostname)) throw new Error('blocked URL host');
    const response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'text/html,text/plain,application/json;q=0.8' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.('location');
      if (!location) throw new Error(`redirect ${response.status} without location`);
      current = new URL(location, current).toString(); continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers?.get?.('content-type') || '';
    if (type && !/(text\/html|text\/plain|application\/json)/i.test(type)) throw new Error('unsupported content type');
    return { url: current, html: await response.text(), contentType: type };
  }
  throw new Error('too many redirects');
}

export async function researchUrls(brief, { fetchImpl = globalThis.fetch } = {}) {
  const urls = extractUrls(brief); const pages = []; let total = 0;
  for (const url of urls) {
    try {
      const page = await fetchPage(url, fetchImpl); const json = /application\/json/i.test(page.contentType); const raw = json ? JSON.stringify(JSON.parse(page.html)) : page.html; const text = cap(json ? raw : htmlToText(raw), Math.min(MAX_PAGE_CHARS, MAX_TOTAL_CHARS - total));
      if (text) { pages.push({ url, finalUrl: page.url, title: json ? '' : pageTitle(page.html), text, status: 'ok' }); total += text.length; }
    } catch (error) { pages.push({ url, status: 'failed', error: String(error?.message || error).slice(0, 180) }); }
    if (total >= MAX_TOTAL_CHARS) break;
  }
  return { detected: urls.length > 0, urls, pages };
}

export async function enrichBriefWithWebReferences(brief, options = {}) {
  const research = await researchUrls(brief, options);
  const successful = research.pages.filter(page => page.status === 'ok');
  if (!successful.length) return { brief, meta: research };
  const appendix = successful.map(page => `\n\n--- Referenced page: ${page.title || page.finalUrl} (${page.url}) ---\n${page.text}`).join('');
  return { brief: `${brief}${appendix}`, meta: research };
}
