# ai-ugc-maker

Local AI UGC video maker — HyperFrames + React, agent-agnostic.

Turn a text brief into a UGC-style MP4 using HeyGen's open-source HyperFrames (HTML/CSS/JS → deterministic MP4) as the render engine, driven by a thin React + Express interface.

## Quick Start

```bash
# Prerequisites: Node >= 22, FFmpeg, Chromium
node -v  # should be v22.x (use nvm use 22)

# Install dependencies
npm install
cd server && npm install && cd ..
cd web && npm install && cd ..

# Development mode (starts both servers)
npm run dev

# Or start individually
npm run dev:server  # backend on http://127.0.0.1:8787
npm run dev:web     # frontend on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173 in your browser.

## Production Build

```bash
npm run build    # builds frontend to web/dist/
npm run start    # Express serves SPA + API on :8787
```

## Architecture

```
server/           Express 5 backend
  src/
    index.js      Entry point, routes, SPA catch-all
    jobs.js       Job state machine (queued → running → done | failed | cancelled)
    store.js      JSON file persistence (atomic writes)
    jobRunner.js  Orchestrates composer → lint → render
    config.js     Environment config
    composer/     Strategy pattern: template.js (no agent) or agent.js (shells out to $AGENT_CMD)
    templates/    HyperFrames composition presets
    routes/       API routes

web/              Vite 7 + React 18 frontend
  src/
    api/          Fetch wrapper
    hooks/        useJobs, useJob (auto-polling)
    components/   Shared: JobCard, JobStatusBadge, ProgressBar, VideoPlayer, PromptForm
    pages/        Home (form + history), JobDetail (status + video)
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/jobs | Create a job `{ brief, durationSec, style, music }` |
| GET | /api/jobs | List all jobs (newest first) |
| GET | /api/jobs/:id | Get job detail |
| GET | /api/jobs/:id/output | Stream rendered MP4 |
| POST | /api/jobs/:id/cancel | Cancel a queued/running job |
| GET | /api/health | Health check |

## Styles

- `product` — Product teaser (1920×1080)
- `explainer` — Explainer video (1920×1080)
- `social` — Social clip (1080×1920, vertical)

## Agent Mode

Set `COMPOSER=agent` and `AGENT_CMD=claude` (or `codex`, `opencode`, etc.) to have an AI agent generate the composition HTML instead of using templates. The agent receives the brief + duration + style and writes `index.html` to the job workspace.

```bash
COMPOSER=agent AGENT_CMD=claude npm run dev:server
```

## Tech Stack

- **Backend:** Node.js >= 22, Express 5, @hyperframes/producer, @hyperframes/sdk
- **Frontend:** Vite 7, React 18, react-router-dom
- **Render:** HeyGen HyperFrames (HTML/CSS/JS → MP4, local, $0)

## License

MIT
