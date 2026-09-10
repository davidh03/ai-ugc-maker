// Minimal structured (JSON-line) logger with secret redaction, so
// production logs stay machine-parseable and never leak API keys, the auth
// token, or uploaded prompt content verbatim.

const REDACT_KEYS = new Set(['apikey', 'api_key', 'authorization', 'token', 'password', 'secret']);

function secretValues() {
  return [
    process.env.OPENAI_API_KEY,
    process.env.GOOGLE_TTS_API_KEY,
    process.env.MINIMAX_API_KEY,
    process.env.CARTESIA_API_KEY,
    process.env.API_AUTH_TOKEN,
  ].filter(Boolean);
}

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const secret of secretValues()) if (secret) out = out.split(secret).join('[redacted]');
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val);
    return out;
  }
  return value;
}

function emit(level, message, meta) {
  const entry = { time: new Date().toISOString(), level, message, ...(meta ? redact(meta) : {}) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};
