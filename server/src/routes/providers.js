import { Router } from 'express';
import { getStatus, startLogin, getLogin, cancelLogin, listModels } from '../providers/codexProvider.js';
import { getOpenCodeModels } from '../providers/opencodeProvider.js';
import { getCartesiaVoices } from '../cartesiaVoices.js';

export const providersRouter = Router();
providersRouter.get('/', async (_req, res) => { const codex = await getStatus(); res.json({ providers: [{ id: 'opencode', name: 'OpenCode', authState: 'connected', connectionLabel: 'Local OpenCode', canConnect: false }, { id: 'openai-codex', name: 'OpenAI Codex', authState: codex.authState, connectionLabel: codex.email ? `${codex.email}${codex.planType ? ` · ${codex.planType}` : ''}` : 'Connect ChatGPT', canConnect: true }] }); });
providersRouter.get('/openai-codex/status', async (_req, res) => res.json(await getStatus()));
providersRouter.post('/openai-codex/connect', async (req, res) => { try { res.json(await startLogin(req.body?.flow || 'browser')); } catch (error) { res.status(503).json({ error: 'provider_unavailable', message: error.message }); } });
providersRouter.get('/openai-codex/login/:loginId', (req, res) => { const login = getLogin(req.params.loginId); if (!login) return res.status(404).json({ error: 'login_not_found' }); res.json(login); });
providersRouter.post('/openai-codex/login/:loginId/cancel', async (req, res) => { try { res.json(await cancelLogin(req.params.loginId)); } catch (error) { res.status(400).json({ error: error.message }); } });
providersRouter.get('/models', async (req, res) => { try { const provider = req.query.provider || 'opencode'; const models = provider === 'openai-codex' ? await listModels() : await getOpenCodeModels(); res.json({ provider, models }); } catch (error) { res.status(503).json({ error: 'catalog_unavailable', message: error.message }); } });
providersRouter.get('/voices', async (req, res) => { try { const provider = req.query.provider || 'cartesia-tts'; if (provider !== 'cartesia-tts') return res.json({ provider, voices: [] }); res.json({ provider, voices: await getCartesiaVoices() }); } catch (error) { res.status(503).json({ error: 'voice_catalog_unavailable', message: error.message }); } });
