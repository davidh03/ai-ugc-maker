# ai-ugc-maker

Local AI UGC video studio — React/Vite + Express + HyperFrames, with template generation and provider-aware AI composition.

## Quick start

Prerequisites: Node.js 22+, FFmpeg, Chromium. The renderer rejects Node 20.

```bash
nvm use 22
npm install
npm --prefix server install
npm --prefix web install
npm run dev
```

Open `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:8787`.

Production-style local server:

```bash
npm run build
npm run start
```

## OpenAI Codex connection

The studio supports **OpenAI Codex (ChatGPT)** through the official local `codex app-server` JSONL protocol. Codex owns OAuth token persistence and refresh; this application never reads, copies, stores, or returns Codex tokens.

Check the local prerequisite:

```bash
codex login status
```

In the studio, choose `AI composer` → `OpenAI Codex` → `Connect`. Browser OAuth opens OpenAI's returned authorization URL. Device-code fallback displays the verification URL and code. After login, the model selector is populated from Codex `model/list`, so the account's available models are not hardcoded.

Optional override:

```bash
CODEX_BIN=/absolute/path/to/codex npm run dev:server
```

OpenAI Codex OAuth is distinct from an OpenAI API key. No API-key billing path is added here.

## Providers and jobs

- `template`: instant local preset composition; no provider or model required.
- `agent` + `opencode`: uses the local OpenCode CLI and its available model catalog.
- `agent` + `openai-codex`: uses `codex exec` with `workspace-write`, `--ephemeral`, and an isolated job workspace.

Provider endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/providers` | Sanitized provider inventory and auth state |
| GET | `/api/providers/openai-codex/status` | Sanitized Codex account status |
| POST | `/api/providers/openai-codex/connect` | Start browser/device OAuth |
| GET | `/api/providers/openai-codex/login/:id` | Poll login status |
| POST | `/api/providers/openai-codex/login/:id/cancel` | Cancel pending login |
| GET | `/api/providers/models?provider=openai-codex` | Live Codex model catalog |
| GET | `/api/models` | Backward-compatible OpenCode catalog alias |

Job payloads use `composer`, `provider`, and `model`:

```json
{
  "brief": "A 15 second product teaser",
  "durationSec": 15,
  "style": "product",
  "composer": "agent",
  "provider": "openai-codex",
  "model": "gpt-5.6-sol",
  "music": false,
  "assets": []
}
```

Legacy stored jobs with `agent: "none"` or `agent: "opencode"` remain readable.

## Architecture

```text
server/src/
  index.js                 Express entrypoint and compatibility routes
  jobs.js                  Provider-aware validation and job state machine
  jobRunner.js             Compose → lint → render orchestration
  providers/
    codexAppServer.js      JSONL process client and request correlation
    codexProvider.js       OAuth/account/model service with secret stripping
    opencodeProvider.js    OpenCode model catalog adapter
  routes/providers.js      Thin provider HTTP routes
  composer/agent.js        Isolated OpenCode/Codex composition execution
  composer/template.js     Local HyperFrames presets

web/src/
  App.jsx                  Responsive studio shell/navigation
  pages/Home.jsx           Creation studio and recent generations
  components/PromptForm.jsx Provider/model-aware brief editor
  hooks/useProviders.js    Provider status and OAuth polling
  hooks/useProviderModels.js Provider-scoped model loading
  api/client.js            API boundary
  styles.css               Dark cinematic responsive design system
```

## Validation

```bash
npm --prefix server test
npm --prefix web run lint
npm --prefix web run build
npm run check
```

A real local smoke test should call `/api/providers`, `/api/providers/openai-codex/status`, `/api/providers/models?provider=openai-codex`, then create a short Codex job and verify it reaches `done` with an MP4 under `server/data/jobs/<id>/output.mp4`.

## Styles

- `product` — landscape product teaser
- `explainer` — landscape explainer
- `social` — vertical social clip

## Deployment

Production hosting plan: [`docs/plans/aws-production-hosting-cicd.md`](docs/plans/aws-production-hosting-cicd.md).
Runbook (env vars, Docker Compose, CI/CD setup, what's validated vs. not): [`docs/deploy/README.md`](docs/deploy/README.md).

## Safety boundaries

- Bind the development server to loopback unless explicitly needed otherwise.
- Do not expose OAuth mutation routes on a public interface.
- Do not use Codex sandbox bypass flags.
- Do not commit `.env`, generated jobs, renders, or provider credentials.
