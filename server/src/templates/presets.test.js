import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presets } from './presets.js';

describe('template presets', () => {
  it('escapes HTML-significant characters in the brief instead of injecting them raw', () => {
    const brief = 'Boost sales by 50% <script>alert(1)</script> & "quoted"';
    const html = presets.product.html(brief, 15);
    assert.equal(html.includes('<script>alert(1)</script>'), false, 'raw script tag must not appear in the composed HTML');
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /50% .*&amp;.*&quot;quoted&quot;/s);
  });

  it('still renders normal briefs without mangling plain text', () => {
    const html = presets.social.html('A simple product teaser', 15);
    assert.match(html, /A simple product teaser/);
  });
});
