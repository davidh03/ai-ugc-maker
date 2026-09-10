import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';

const PUBLIC_PATHS = new Set(['/health', '/ready']);

function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Gates everything mounted under /api behind a bearer token. Off by default
// (config.authToken === '') so local dev is unaffected; set API_AUTH_TOKEN
// before exposing this server on the public internet. Accepts the token via
// either the Authorization header (fetch/XHR calls) or a `token` query
// param, since <video>/<a download> tags can't attach custom headers — see
// docs/deploy/README.md for how the frontend and Caddy should pass it.
export function createAuthMiddleware({ token = config.authToken } = {}) {
  if (!token) {
    logger.warn('API_AUTH_TOKEN is not set — /api/* is unauthenticated. Set it before exposing this server publicly.');
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) return next();
    const header = req.headers.authorization || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
    if (provided && tokensMatch(provided, token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  };
}
