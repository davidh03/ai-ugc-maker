# ai-ugc-maker

Local AI UGC video maker — HyperFrames + React, agent-agnostic.

## Quick Start

npm install
cd server && npm install && cd ../web && npm install && cd ..
npm run dev

## Architecture

- server/ — Express 5 backend, job queue, HyperFrames render pipeline
- web/ — Vite 7 + React 18 frontend, job management UI
