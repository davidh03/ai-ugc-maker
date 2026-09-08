import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractUrls, enrichBriefWithWebReferences } from './webResearch.js';

const response = (body, status = 200, type = 'text/html') => ({ ok: status >= 200 && status < 300, status, text: async () => body, headers: { get: key => key === 'content-type' ? type : null } });

describe('web research', () => {
  it('extracts safe, unique HTTP(S) URLs and caps them', () => {
    const urls = extractUrls('https://example.com/a https://example.com/a http://localhost/x https://example.org https://one.test https://two.test https://three.test');
    assert.deepEqual(urls, ['https://example.com/a', 'https://example.org/', 'https://one.test/']);
  });
  it('scrapes readable HTML and preserves URL references', async () => {
    const { brief, meta } = await enrichBriefWithWebReferences('Make a video from https://example.com/product', { fetchImpl: async () => response('<html><head><title>Product</title><script>bad()</script></head><body><h1>Useful product facts</h1></body></html>') });
    assert.equal(meta.pages[0].title, 'Product'); assert.match(brief, /Useful product facts/); assert.match(brief, /https:\/\/example.com\/product/);
  });
  it('fails softly for blocked or unavailable pages', async () => {
    const { brief, meta } = await enrichBriefWithWebReferences('Use https://192.168.1.2/private', { fetchImpl: async () => { throw new Error('should not fetch'); } });
    assert.equal(brief, 'Use https://192.168.1.2/private'); assert.equal(meta.detected, false);
  });
});
