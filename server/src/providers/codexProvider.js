import { createCodexAppServer } from './codexAppServer.js';

const codex = createCodexAppServer();
let account = { authState: 'disconnected', email: null, planType: null, requiresOpenaiAuth: true };
const logins = new Map();
codex.on('account/updated', params => { account = { ...account, authState: params.authMode === 'chatgpt' ? 'connected' : 'disconnected', planType: params.planType || null }; });
codex.on('account/login/completed', params => { const current = logins.get(params.loginId); if (current) { current.status = params.success ? 'completed' : 'failed'; current.error = params.error || null; } });

export function sanitizeAccount(result = {}) { const raw = result.account || result; const type = raw.type || null; return { provider: 'openai-codex', authState: type === 'chatgpt' ? 'connected' : type ? 'disconnected' : account.authState, email: raw.email || account.email || null, planType: raw.planType || account.planType || null, requiresOpenaiAuth: result.requiresOpenaiAuth ?? true }; }
export async function getStatus() { try { const result = await codex.request('account/read', { refreshToken: false }); account = sanitizeAccount(result); return account; } catch (error) { return { ...account, authState: 'unavailable', error: error.message }; } }
export async function startLogin(flow = 'browser') { const type = flow === 'device' ? 'chatgptDeviceCode' : 'chatgpt'; const result = await codex.request('account/login/start', { type }); const loginId = result.loginId || crypto.randomUUID(); const record = { loginId, flow, status: 'pending', createdAt: Date.now(), ...result }; logins.set(loginId, record); return { flow, loginId, ...(result.authUrl ? { authUrl: result.authUrl } : {}), ...(result.verificationUrl ? { verificationUrl: result.verificationUrl, userCode: result.userCode } : {}), expiresAt: Date.now() + 10 * 60 * 1000 }; }
export function getLogin(loginId) { const login = logins.get(loginId); if (!login) return null; if (login.status === 'pending' && Date.now() - login.createdAt > 10 * 60 * 1000) login.status = 'expired'; return { loginId, flow: login.flow, status: login.status, error: login.error || null }; }
export async function cancelLogin(loginId) { await codex.request('account/login/cancel', { loginId }); const login = logins.get(loginId); if (login) login.status = 'cancelled'; return getLogin(loginId); }
export async function listModels() { const result = await codex.request('model/list', { includeHidden: false }); return (result.data || result.models || []).filter(model => !model.hidden).map(model => ({ id: model.id || model.model, name: model.displayName || model.name || model.id, description: model.description || '', default: Boolean(model.isDefault || model.default), reasoningEfforts: model.supportedReasoningEfforts || [] })); }
export async function stop() { await codex.stop(); }
