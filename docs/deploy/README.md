# Deployment runbook

Implements Phase 1 (production-readiness audit) and scaffolds Phases 2–5 of
[`docs/plans/aws-production-hosting-cicd.md`](../plans/aws-production-hosting-cicd.md).
Read that plan first — this doc is the "how", not the "why".

## What has and hasn't been validated

Done and test-covered:
- `/api/health` (liveness) and `/api/ready` (readiness: data dir writable,
  ffmpeg/ffprobe on PATH) — `server/src/index.js`.
- Graceful shutdown: a SIGTERM/SIGINT marks any job this process is actively
  rendering as `status:'failed', recoverable:true` instead of leaving it
  stuck at `'running'` forever. A job orphaned by a *previous* process that
  died without that handler (crash, `kill -9`, power loss) is caught at the
  next startup instead. See `reconcileOrphanedJobs`/`markRunningJobsInterrupted`
  in `server/src/jobRunner.js`, tests in `server/src/jobRecovery.test.js`.
- Optional bearer-token auth on `/api/*` (`server/src/auth.js`,
  `server/src/auth.test.js`) — off by default, so local dev is unaffected.
- Upload extension allow-list per asset category (`server/src/index.js`).
- A real `.env`-loading bug: `config.js` read `process.env` into a top-level
  constant, but `.env`-file merging happened later in `index.js` — any
  module importing `config.js` before that point (several do, transitively)
  got stale defaults. Fixed by moving the merge into `loadEnv.js`, imported
  at the top of `config.js` itself. Backend suite: `npm --prefix server test`
  (192 passing after this change).
- Structured JSON logging with secret redaction for the new startup/shutdown
  log lines (`server/src/logger.js`). The rest of the codebase's existing
  `console.*` calls were intentionally left alone — see "Not done" below.

**Not build/deploy-tested** (no Docker daemon and no AWS resources exist in
the environment this was written in):
- `deploy/Dockerfile` — a best-effort image based on what `hyperframes
  doctor` reports this app actually needs (headless Chrome via Puppeteer's
  own download, not a system `chromium` package; ffmpeg; ImageMagick).
  Phase 2 of the plan ("containerize and run locally") is exactly this
  validation step — do not treat this Dockerfile as verified until you've
  actually run `docker compose -f deploy/docker-compose.production.yml build`
  and rendered one real test video through the container.
- `deploy/docker-compose.production.yml`, `deploy/Caddyfile` — untested for
  the same reason.
- `.github/workflows/deploy.yml` — cannot run until Phase 3's AWS resources
  (ECR repo, EC2 instance with the SSM agent, an OIDC IAM role) exist. It's
  gated off (`vars.AWS_DEPLOY_ENABLED`) specifically so it doesn't fail on
  every push in the meantime. Expect to debug the SSM shell-escaping the
  first time it actually runs against a real instance.

## Not done (explicitly out of scope for this pass)

- **Full structured-logging sweep.** Only the new code (startup, shutdown,
  reconciliation) uses `logger.js`. The rest of the codebase's existing
  `console.log`/`warn`/`error` calls (jobRunner stage transitions, provider
  errors, etc.) were left as-is — touching every call site was judged too
  large a diff to land safely next to your in-flight `jobRunner.js` changes
  and an active render. Worth a follow-up pass.
- **True web/worker process separation.** Phase 1's file list asks for this,
  but it requires Phase 6's storage refactor first (JSON job store → real
  DB, MP4s → S3, SQS-driven workers) — splitting the process today would
  just be two containers racing the same `server/data/jobs.json`. The
  compose file stays honest about this: one `app` service, with a comment
  explaining why.
- **Frontend changes for `API_AUTH_TOKEN`.** The backend supports it
  (header or `?token=` query param, since `<video>`/`<img>` tags can't set
  custom headers), but the React app doesn't attach it anywhere yet. For a
  first deployment, gate the whole site with Caddy's `basicauth` instead
  (commented block in `deploy/Caddyfile`) and leave `API_AUTH_TOKEN` unset —
  see "Access control" below.

## Agent composer / Luna in production — read this before relying on it

`composer=agent` (and the Luna image-analysis step in `assetAnalyzer.js`)
shell out to `codex`/`opencode` CLIs, hardcoded-by-default to
`/home/clez/.local/bin/codex` and `/home/clez/.opencode/bin/opencode` (or an
override via `CODEX_BIN`/`OPENCODE_BIN` — already read from the environment,
so no code change was needed there). Those CLIs are OAuth-authenticated to
this specific machine's login. **This is a real gap for AWS, not a config
oversight**: `deploy/Dockerfile` does not install or authenticate either
CLI.

- `composer=template` (the default) and voiceover/TTS providers don't need
  either binary and work fine in the container as-is.
- Luna image analysis degrades gracefully when the binary is missing
  (`assetAnalyzer.js` returns `null` and the pipeline continues) — it won't
  crash production, it'll just silently skip that enrichment.
- If you need `composer=agent` in production, you have two real options,
  neither implemented here: (a) install the CLI and bake a service-account
  OAuth session into the image/instance, or (b) look at `hyperframes cloud`
  / `hyperframes lambda` — HeyGen-hosted or AWS Lambda rendering that
  doesn't need local Chrome/ffmpeg at all, which could sidestep a chunk of
  this Dockerfile's complexity. Worth evaluating before Phase 2 goes deep on
  the current Dockerfile.

## Access control for a first deployment

Recommended: **Caddy `basicauth` for the whole site**, not the app's
`API_AUTH_TOKEN`. The token is a single shared secret with no session — a
browser can't attach it to `<video src>`/`<img src>`/download-link
requests, so enabling it today would break video playback until someone
also patches the frontend. Basic Auth, entered once in the browser, is sent
with every request automatically. See the commented block in
`deploy/Caddyfile`.

`API_AUTH_TOKEN` still exists as defense-in-depth for scripted/API-only
access (e.g. a future integration that only calls JSON endpoints) — set it
in addition to Basic Auth if you want that, not instead of it.

## Local Phase 2 testing (do this before touching AWS)

```bash
cp .env.example server/.env.production   # fill in real keys; never commit this file
cd deploy
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/ready
# generate one short test video end-to-end before trusting the image
```

Confirm the data volume survives a recreate (`docker compose down && up`
should not lose `server/data/jobs.json`), and that killing the container
mid-render (`docker kill`) leaves that job `status:'failed', recoverable:true`
rather than stuck at `'running'`.

## GitHub repository configuration required before `deploy.yml` can run

Settings → Environments → `production` (create it), then add as
**variables** (not secrets — none of these are sensitive by themselves; the
sensitivity is in the IAM role's permissions):

| Variable | Purpose |
|---|---|
| `AWS_DEPLOY_ENABLED` | Set to `true` to un-gate the workflow. Leave unset/`false` until Phase 3 infra exists. |
| `AWS_ROLE_ARN` | IAM role GitHub OIDC assumes — scope it to ECR push + `ssm:SendCommand`/`GetCommandInvocation` on the one instance, nothing broader. |
| `AWS_REGION` | e.g. `us-east-1`. |
| `ECR_REPOSITORY` | ECR repo name created in Phase 3. |
| `EC2_INSTANCE_ID` | The instance `deploy.yml` targets via SSM (not SSH). |

The EC2 instance itself needs: the SSM agent running, this repo checked out
(or just `deploy/`) at `/opt/ai-ugc-maker`, Docker + the Compose plugin
installed, and `server/.env.production` populated out-of-band (Secrets
Manager/SSM Parameter Store, per the plan — never through this repo).

## Rollback

Automatic: `deploy.yml` reads the currently-running image's
`deploy.image_tag` label before deploying, and re-deploys it if the new
image fails its `/api/ready` check (up to 10 tries, ~60s).

Manual, on the instance:
```bash
cd /opt/ai-ugc-maker
IMAGE=<registry>/<repo>:<previous-sha> IMAGE_TAG=<previous-sha> \
  docker compose -f deploy/docker-compose.production.yml up -d
```
