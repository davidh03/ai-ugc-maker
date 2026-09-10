# AGENTS.md

## Project
ai-ugc-maker generates UGC-style MP4 videos from text briefs using an Express backend, React/Vite frontend, and HyperFrames.

## Runtime
- Node.js 22 is the supported runtime (`.nvmrc`).
- Required local tools include FFmpeg and Chromium for rendering.
- Keep server state under `server/data/` and renders under `server/renders/`; both are ignored by Git.

## Structure
- `server/src/routes/`: thin HTTP routes
- `server/src/jobs.js`: job validation and state transitions
- `server/src/jobRunner.js`: composition, lint, render, and persistence orchestration
- `server/src/composer/`: composer strategies
- `server/src/templates/`: HyperFrames presets
- `web/src/`: React UI, hooks, components, and pages

## Quality bar
- Keep changes narrow and preserve unrelated dirty work.
- Add or update tests for behavior changes.
- Run `npm test`, `npm run lint`, and `npm run build` before declaring work complete.
- Do not commit secrets, generated videos, job data, or build output.
