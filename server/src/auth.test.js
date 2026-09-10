import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthMiddleware } from './auth.js';

function mockReq({ path = '/jobs', headers = {}, query = {} } = {}) {
  return { path, headers, query };
}
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = payload => { res.body = payload; return res; };
  return res;
}

describe('createAuthMiddleware', () => {
  it('no-ops when no token is configured (local dev default)', () => {
    const mw = createAuthMiddleware({ token: '' });
    let called = false;
    mw(mockReq(), mockRes(), () => { called = true; });
    assert.equal(called, true);
  });

  it('always allows /health and /ready even with a token configured', () => {
    const mw = createAuthMiddleware({ token: 'secret' });
    let called = false;
    mw(mockReq({ path: '/health' }), mockRes(), () => { called = true; });
    assert.equal(called, true);
  });

  it('rejects a request with no credentials', () => {
    const mw = createAuthMiddleware({ token: 'secret' });
    const res = mockRes();
    let called = false;
    mw(mockReq(), res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects a wrong bearer token', () => {
    const mw = createAuthMiddleware({ token: 'secret' });
    const res = mockRes();
    let called = false;
    mw(mockReq({ headers: { authorization: 'Bearer wrong' } }), res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 401);
  });

  it('accepts the correct bearer token', () => {
    const mw = createAuthMiddleware({ token: 'secret' });
    let called = false;
    mw(mockReq({ headers: { authorization: 'Bearer secret' } }), mockRes(), () => { called = true; });
    assert.equal(called, true);
  });

  it('accepts the correct token via query param, for media tags that cannot set headers', () => {
    const mw = createAuthMiddleware({ token: 'secret' });
    let called = false;
    mw(mockReq({ query: { token: 'secret' } }), mockRes(), () => { called = true; });
    assert.equal(called, true);
  });
});
