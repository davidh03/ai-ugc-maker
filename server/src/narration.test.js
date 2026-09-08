import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrationScript, narrationDirection } from './narration.js';

describe('format-aware narration', () => {
  it('creates an explainer arc instead of reading the raw brief', () => {
    const script = buildNarrationScript({ brief: 'Cadre Crew helps teams manage leads.', style: 'explainer', durationSec: 30 });
    assert.match(script, /Let’s break this down|Let's break this down/);
    assert.match(script, /problem|approach/i);
    assert.notEqual(script, 'Cadre Crew helps teams manage leads.');
  });
  it('uses different natural structures for product and social formats', () => {
    const brief = 'A faster way to organize your work.';
    const product = buildNarrationScript({ brief, style: 'product', durationSec: 15 });
    const social = buildNarrationScript({ brief, style: 'social', durationSec: 15 });
    assert.match(product, /Meet a better way/);
    assert.match(social, /Quick one/);
    assert.notEqual(product, social);
  });
  it('provides delivery direction for every supported format', () => {
    for (const style of ['product', 'explainer', 'social']) assert.match(narrationDirection(style), /natural/i);
  });
});
