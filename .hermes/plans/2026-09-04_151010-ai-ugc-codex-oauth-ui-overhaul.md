# AI UGC Maker Codex OAuth + Studio UI Overhaul Implementation Plan

> **For Hermes:** Implement this plan directly in the active GPT-5.6 Sol session. Do not delegate. Preserve all unrelated dirty work and execute one verified task at a time.

**Goal:** Add OpenAI Codex as a first-class, OAuth-connected AI provider with live model selection, then replace the prototype UI with a polished, media-first AI video creation studio.

**Architecture:** Run the official `codex app-server` as a private local child process for account status, ChatGPT OAuth, and dynamic `model/list`; never read or copy OAuth tokens into this project. Keep actual composition jobs simple and isolated by invoking `codex exec` in each job workspace. Add a small provider registry between the Express API and both OpenCode/Codex, then rebuild the React frontend around a responsive studio shell using real existing capabilities only.

**Tech Stack:** Node.js 22, Express 5, React 19, Vite 8, Node test runner, Vitest + React Testing Library, optional Playwright smoke tests, OpenAI Codex CLI/app-server, OpenCode CLI, HyperFrames, FFmpeg, plain CSS custom properties, Lucide React icons.

---

## 1. Verified current context

Target workspace: `/home/clez/Documents/GitHub/ai-ugc-maker` on laptop `clezentine`.

Current runtime:
- Express API: `127.0.0.1:8787`
- Vite frontend: `localhost:5173`
- Node requirement: v22 from `.nvmrc`
- Codex CLI: `/home/clez/.local/bin/codex`, version `0.151.0`
- Codex auth status: already signed in with ChatGPT
- Hermes laptop launcher exists but is broken because its referenced Python venv no longer exists. This feature must not depend on that launcher.

Current product shape:
- `server/src/index.js` owns routes directly and `/api/models` only shells out to `opencode models`.
- `server/src/composer/agent.js` knows the names `opencode`, `claude`, and `codex`, but only builds correct arguments for OpenCode. Codex currently receives a bare prompt instead of `codex exec`.
- `server/src/jobs.js` stores `agent` and `model` without provider-aware validation.
- `web/src/components/PromptForm.jsx` hardcodes Template/OpenCode and uses the same model list for every AI backend.
- Most UI styling is inline. `web/src/index.css` has only three rules, while `web/src/App.css` is leftover Vite starter CSS and is not the current product design.
- The app has useful foundations worth preserving: asset upload, required/optional assets, local draft persistence, job polling, cancellation, status, MP4 preview/download, YouTube transcript enrichment, and HyperFrames rendering.

Dirty-work boundary — preserve exactly:
- Modified: `package.json`
- Modified: `server/.env.example`
- Modified: `server/package.json`
- Modified: `server/src/jobRunner.js`
- Modified: `server/src/jobs.js`
- Untracked: `AGENTS.md`, `DESIGN.md`, `server/src/youtubeTranscript.js`, `server/src/youtubeTranscript.test.js`

Rules for implementation:
1. Never reset, clean, overwrite, or auto-stash the laptop checkout.
2. Capture `git diff` and `git status --short` before every overlapping edit.
3. Use targeted patches and stage with explicit paths or `git add -p`; never use `git add -A`.
4. Treat the current working tree as the baseline. Existing transcript/job-runner work is part of the product, not disposable debris.
5. Do not modify Hermes Agent itself for this feature.

## 2. Product and UX direction

### Visual direction

Use a modern cinematic creator-workstation style inspired by Runway's media-first restraint and the precision of current AI creation tools, without cloning another product:
- Near-black canvas: `#09090B`
- Raised workspace surfaces: `#111216` and `#17181D`
- Subtle borders: `#27282F`
- Primary text: `#F7F7F8`
- Secondary text: `#A1A1AA`
- One restrained violet accent: `#7C5CFC`
- Success/warning/error only for state, not decoration
- Inter/Geist-style sans typography; 8px spacing system
- Media thumbnails and video frames provide visual richness; avoid decorative gradient soup
- 8–12px control radii and 14–16px panel radii; no excessive pill-shaped everything
- Motion limited to panel transitions, progress, upload feedback, and job-state changes; honor `prefers-reduced-motion`

### Desktop information architecture

1. **Left navigation rail (220–240px)**
   - Product mark
   - Create
   - Generations
   - Assets
   - Settings / AI connections
   - Provider status at the bottom

2. **Primary studio area**
   - Page title and compact project/job context
   - Large creative brief editor
   - Media drop zone with real image/video/audio previews
   - Format controls: style/aspect ratio, duration, music
   - AI provider and model controls
   - Strong Generate button with clear disabled reason

3. **Preview/activity rail (360–440px on wide screens)**
   - Selected or latest output preview
   - Current render progress/stage
   - Recent generation cards with thumbnail/status metadata

4. **Job detail route**
   - Large video preview
   - Prompt and generation settings
   - Asset-use diagnostics
   - Progress/error timeline
   - Download and cancel actions

### Responsive behavior
- `>= 1280px`: navigation + studio + preview rail
- `768–1279px`: compact navigation + two-column studio
- `< 768px`: single-column flow; navigation becomes a drawer; sticky bottom Generate action
- Minimum 44px touch targets, visible keyboard focus, semantic labels, and no horizontal overflow at 390px

### Scope discipline

The redesign must not fake features the backend does not have. Do not add nonfunctional avatar, voice-clone, lip-sync, publishing, campaign analytics, or timeline-editor controls. The modern UI should make the current generation pipeline feel complete rather than decorating dead buttons.

## 3. Codex integration decision

Use the official Codex app-server protocol instead of copying Hermes OAuth code.

Why:
- `codex app-server` is the interface OpenAI uses for rich clients such as its VS Code extension.
- It provides `account/read`, `account/login/start`, `account/login/cancel`, `account/logout`, `account/updated`, `account/login/completed`, and `model/list`.
- Browser login returns an `authUrl`; device login returns `verificationUrl` and `userCode` for the frontend to present.
- Codex owns token persistence and refresh under its own auth backend. The AI UGC Maker never needs to read `~/.codex/auth.json`.
- Hermes's current subscription proxy only ships Nous and xAI adapters, not OpenAI Codex. Adding a Hermes proxy adapter would expand this task into a Hermes core change and still would not provide the desired app-owned OAuth UX.

Important product wording:
- Label this provider **OpenAI Codex (ChatGPT)**.
- The dropdown shows models returned by Codex `model/list` for the connected account.
- Do not promise every model from the OpenAI pay-per-token API. ChatGPT/Codex OAuth and `OPENAI_API_KEY` are different billing/auth paths.
- API-key OpenAI support is out of scope unless requested separately.

Authoritative references:
- Hermes provider docs: `https://hermes-agent.nousresearch.com/docs/integrations/providers/`
- OpenAI Codex app-server protocol: `https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md`
- The app-server handshake is `initialize` request, then `initialized` notification, over JSONL stdio.

## 4. Target API contracts

### Provider inventory

`GET /api/providers`

```json
{
  "providers": [
    {
      "id": "opencode",
      "name": "OpenCode",
      "authState": "connected",
      "connectionLabel": "Local OpenCode",
      "canConnect": false
    },
    {
      "id": "openai-codex",
      "name": "OpenAI Codex",
      "authState": "connected",
      "connectionLabel": "user@example.com · Plus",
      "canConnect": true
    }
  ]
}
```

Allowed `authState` values: `connected`, `disconnected`, `connecting`, `expired`, `unavailable`, `error`.

### Codex status

`GET /api/providers/openai-codex/status`

Return only sanitized metadata:

```json
{
  "provider": "openai-codex",
  "authState": "connected",
  "email": "user@example.com",
  "planType": "plus",
  "requiresOpenaiAuth": true
}
```

Never return access tokens, refresh tokens, raw auth-store rows, headers, or child-process environment values.

### Start OAuth

`POST /api/providers/openai-codex/connect`

Request:

```json
{ "flow": "browser" }
```

Browser response:

```json
{
  "flow": "browser",
  "loginId": "uuid",
  "authUrl": "https://chatgpt.com/...",
  "expiresAt": 1788540000000
}
```

Device fallback response:

```json
{
  "flow": "device",
  "loginId": "uuid",
  "verificationUrl": "https://auth.openai.com/codex/device",
  "userCode": "ABCD-1234",
  "expiresAt": 1788540000000
}
```

The frontend opens `authUrl` in a user-initiated new tab for browser flow. It displays the URL/code with Copy and Open actions for device flow.

### Login polling and cancellation

- `GET /api/providers/openai-codex/login/:loginId`
- `POST /api/providers/openai-codex/login/:loginId/cancel`

Login status values: `pending`, `completed`, `cancelled`, `failed`, `expired`.

### Provider-scoped model catalog

`GET /api/models?provider=openai-codex`

```json
{
  "provider": "openai-codex",
  "models": [
    {
      "id": "model-id",
      "name": "Display name",
      "description": "Provider supplied description",
      "default": false,
      "reasoningEfforts": ["low", "medium", "high"]
    }
  ]
}
```

For OpenCode, normalize the current `opencode models` output into the same envelope. Never mix providers into one unlabelled array.

### Job creation

Canonical new payload:

```json
{
  "brief": "...",
  "durationSec": 15,
  "style": "social",
  "music": true,
  "composer": "agent",
  "provider": "openai-codex",
  "model": "selected-model-id",
  "reasoningEffort": "medium",
  "assets": []
}
```

Backward compatibility:
- Existing jobs with `agent: "none"` map to `composer: "template"`.
- Existing jobs with `agent: "opencode"` map to `composer: "agent", provider: "opencode"`.
- Preserve old stored JSON unchanged when reading; normalize it at the boundary.

## 5. Implementation tasks

### Task 1: Freeze the current behavior with provider/job contract tests

**Objective:** Protect current dirty work and define the new provider-aware job schema before implementation.

**Files:**
- Modify: `server/src/jobs.test.js`
- Modify carefully: `server/src/jobs.js`
- Create: `server/src/providers/providerContract.test.js`

**Steps:**
1. Record `git status --short` and targeted diffs for every dirty file.
2. Add failing tests for accepted providers, required model for agent mode, template mode without a model, invalid provider rejection, and legacy `agent` normalization.
3. Run `npm --prefix server test`; verify only the new assertions fail.
4. Add small pure helpers: `normalizeJobInput`, `validateProviderSelection`, and constants for supported composers/providers.
5. Run tests again and verify pass.
6. Commit only the relevant hunks if a clean commit can be made without absorbing pre-existing work.

Expected validation:

```bash
npm --prefix server test
```

Expected: all server tests pass, including transcript tests already present in the working tree.

### Task 2: Build a tested Codex JSONL app-server client

**Objective:** Create one long-lived, restartable local Codex control process without exposing credentials.

**Files:**
- Create: `server/src/providers/codexAppServer.js`
- Create: `server/src/providers/codexAppServer.test.js`
- Modify: `server/src/config.js`
- Modify carefully: `server/.env.example`

**Implementation contract:**
- Resolve `CODEX_BIN` from environment, then `/home/clez/.local/bin/codex`, then `PATH`.
- Spawn `codex app-server --listen stdio://` with stdin/stdout pipes and stderr captured only as bounded diagnostics.
- Send exactly one `initialize` request with client metadata such as:

```js
{
  method: 'initialize',
  id: 0,
  params: {
    clientInfo: {
      name: 'ai_ugc_maker',
      title: 'AI UGC Maker',
      version: packageVersion
    }
  }
}
```

- After success, send `{ method: 'initialized', params: {} }` as a notification.
- Maintain an incrementing request ID and a pending-request map with timeouts.
- Parse stdout by complete JSONL lines; route responses by `id` and notifications by `method`.
- Handle process exit by rejecting pending calls, setting provider state to unavailable, and allowing one clean restart on the next request.
- Retry only app-server overload error `-32001` with bounded exponential backoff and jitter.
- Cap stderr retained in memory; do not log auth payloads or request bodies.
- Shut the child down on Express `SIGTERM`/`SIGINT`.

**TDD:** Use an injected fake `spawn` function and fake streams. Test initialization ordering, concurrent request correlation, split JSON lines, malformed lines, timeouts, notifications, process exit, and one restart.

Expected validation:

```bash
node --test server/src/providers/codexAppServer.test.js
```

### Task 3: Add Codex account/OAuth service and local-only routes

**Objective:** Expose safe status and OAuth operations to the React app.

**Files:**
- Create: `server/src/providers/codexProvider.js`
- Create: `server/src/providers/codexProvider.test.js`
- Create: `server/src/routes/providers.js`
- Create: `server/src/routes/providers.test.js`
- Modify: `server/src/index.js`

**Behavior:**
- `account/read` maps to sanitized status.
- Browser flow calls `account/login/start` with `type: "chatgpt"`.
- Device fallback calls it with `type: "chatgptDeviceCode"`.
- Maintain ephemeral login records keyed by `loginId`; merge `account/login/completed` and `account/updated` notifications.
- Cancel pending logins through `account/login/cancel`.
- Do not expose logout in the first UI pass; disconnecting the shared Codex CLI account can break other laptop tools. If logout is later added, require an explicit warning.
- Auth-mutating routes must fail closed unless the request is loopback. If the server is configured to bind beyond loopback later, require a separate local control token before enabling connect/cancel.
- The provider status route may remain readable on the local app but still returns sanitized fields only.

**Tests:** status mapping, browser/device responses, completion notification, failure/expiry, unknown login ID, cancellation, unavailable binary, loopback gate, and secret-field stripping.

Expected validation:

```bash
node --test server/src/providers/*.test.js server/src/routes/providers.test.js
```

### Task 4: Replace the global model list with a provider registry

**Objective:** Give each provider an independent, honest model catalog.

**Files:**
- Create: `server/src/providers/index.js`
- Create: `server/src/providers/opencodeProvider.js`
- Create: `server/src/providers/opencodeProvider.test.js`
- Modify: `server/src/routes/providers.js`
- Remove only after route parity: inline `/api/models` implementation from `server/src/index.js`

**Behavior:**
- `openai-codex`: call app-server `model/list`, exclude hidden entries, preserve the provider's order and reasoning-effort order, and expose a stable normalized shape.
- `opencode`: retain the current safety rule that does not inject the dead `OPENCODE_API_KEY`; normalize CLI lines into the same shape.
- Cache successful catalogs for 30–60 seconds. Never replace an auth/error response with a fake model.
- Return typed failures: `provider_unavailable`, `auth_required`, `catalog_unavailable`.
- A disconnected Codex provider appears in the provider list but its model dropdown remains disabled until connected.

**Tests:** normalized OpenCode output, Codex hidden-model filtering, cache behavior, stale cache fallback with a visible warning, auth-required response, and no secret env injection.

### Task 5: Make Codex a real composition executor

**Objective:** Run selected Codex models against isolated job directories and verify `index.html` is produced.

**Files:**
- Create: `server/src/composer/executors/opencode.js`
- Create: `server/src/composer/executors/codex.js`
- Create: `server/src/composer/executors/codex.test.js`
- Create: `server/src/composer/executors/opencode.test.js`
- Modify carefully: `server/src/composer/agent.js`
- Modify: `server/src/composer/index.js`
- Modify carefully: `server/src/jobRunner.js`

**Codex command shape:**

```text
/home/clez/.local/bin/codex exec
  --model <validated-model-id>
  --cd <absolute-job-dir>
  --sandbox workspace-write
  --skip-git-repo-check
  --ephemeral
  --color never
  <prompt>
```

If reasoning effort is selected, pass it through the supported Codex config mechanism only after proving the exact CLI key against the installed version.

**Safety and correctness:**
- Pass arguments as an array to `spawn`; never build a shell command.
- Validate provider/model IDs against the provider catalog or a strict character allowlist before spawn.
- Keep Codex confined to the job directory with `workspace-write`.
- Do not use `dangerously-bypass-approvals-and-sandbox`.
- Use `--skip-git-repo-check` because job workspaces are not Git repositories.
- Use `--ephemeral` so video jobs do not pollute the user's Codex thread history.
- Require `index.html` to exist and pass basic composition marker checks before reporting compose success.
- Keep cancellation wired to the actual child process, not only the later HyperFrames render.
- Normalize failures into `auth_required`, `invalid_model`, `quota_exhausted`, `composition_invalid`, and `executor_failed` where evidence supports the classification.

**Tests:** exact spawn args, workspace boundary, missing auth, invalid model, cancellation, nonzero exit, exit 0 without `index.html`, and valid output.

### Task 6: Add frontend provider state and API hooks

**Objective:** Keep OAuth/model logic out of presentation components.

**Files:**
- Modify: `web/src/api/client.js`
- Create: `web/src/hooks/useProviders.js`
- Create: `web/src/hooks/useProviderModels.js`
- Create: `web/src/hooks/useCodexLogin.js`
- Create: `web/src/test/setup.js`
- Modify: `web/package.json`
- Modify: root `package.json`

**Client methods:**
- `getProviders()`
- `getProviderStatus(providerId)`
- `startProviderLogin(providerId, flow)`
- `getProviderLogin(providerId, loginId)`
- `cancelProviderLogin(providerId, loginId)`
- `getModels(providerId)`

**State behavior:**
- Poll only while a login is pending.
- Stop on completion, cancellation, failure, expiry, or component unmount.
- Refetch provider status and models after successful login.
- Preserve the user's last provider/model only if still available.
- Store provider/model IDs, never OAuth metadata or tokens, in localStorage.

**Testing setup:** Add Vitest, jsdom, React Testing Library, and user-event. Add `test:web` and include it in the root `check` script.

### Task 7: Establish the design system and application shell

**Objective:** Replace inline prototype styling with a coherent reusable UI foundation.

**Files:**
- Rewrite intentionally: `DESIGN.md`
- Create: `web/src/styles/tokens.css`
- Create: `web/src/styles/base.css`
- Create: `web/src/styles/layout.css`
- Create: `web/src/components/ui/Button.jsx`
- Create: `web/src/components/ui/Select.jsx`
- Create: `web/src/components/ui/Modal.jsx`
- Create: `web/src/components/ui/StatusDot.jsx`
- Create: `web/src/components/AppShell.jsx`
- Create: `web/src/components/Sidebar.jsx`
- Modify: `web/src/main.jsx`
- Modify: `web/src/App.jsx`
- Delete only after confirming unused: Vite starter rules in `web/src/App.css`

**Rules:**
- Move all reusable colors, spacing, radii, type, focus, and motion values to tokens.
- Use CSS classes rather than new inline-style objects.
- Add Lucide React for consistent interface icons; remove emoji as structural icons.
- Keep status colors semantic and text-labelled.
- Add a reusable skeleton, empty state, error banner, and toast region.
- Preserve React Router routes and add placeholders only for routes implemented in this plan.

**Tests:** keyboard navigation through sidebar/modal, Escape closes modal, focus returns to trigger, focus trap works, and reduced-motion rules are present.

### Task 8: Rebuild Home as a modern creation studio

**Objective:** Turn the current form/history stack into a media-first generation workspace.

**Files:**
- Modify: `web/src/pages/Home.jsx`
- Replace/refactor: `web/src/components/PromptForm.jsx`
- Replace/refactor: `web/src/components/AssetUpload.jsx`
- Create: `web/src/components/studio/BriefEditor.jsx`
- Create: `web/src/components/studio/AssetTray.jsx`
- Create: `web/src/components/studio/GenerationSettings.jsx`
- Create: `web/src/components/studio/ProviderModelPicker.jsx`
- Create: `web/src/components/studio/PreviewRail.jsx`
- Create: `web/src/components/studio/RecentGenerations.jsx`
- Create: `web/src/styles/studio.css`

**Behavior to preserve and improve:**
- Preserve local draft restoration and update the storage version with a backward migration from `aiugc-maker-form-v1`.
- Replace raw number duration input with useful presets plus an advanced numeric input.
- Make format/style cards show output orientation clearly.
- Show real local previews for uploaded images/video/audio and keep required/optional/remove controls.
- Report upload errors per file; never add an error response as if it were an asset.
- Generate button summarizes the selected provider/model and clearly explains disabled states.
- Template mode hides provider/model controls without clearing the user's AI selection.
- Recent jobs show actual status, format, duration, provider/model, assets, and creation time.

**Tests:** draft migration, template/agent toggle, provider change resets only invalid models, assets survive provider changes, upload failure, required toggle, valid payload submission, and disabled reasons.

### Task 9: Build the Codex connection and model-selection UX

**Objective:** Let the user connect ChatGPT/Codex without leaving the product confused about state.

**Files:**
- Create: `web/src/components/providers/ProviderConnectionModal.jsx`
- Create: `web/src/components/providers/CodexLoginPanel.jsx`
- Create: `web/src/components/providers/ModelCombobox.jsx`
- Create: `web/src/components/providers/ProviderBadge.jsx`
- Create tests beside these components or under `web/src/components/providers/__tests__/`

**UX sequence:**
1. User selects OpenAI Codex.
2. If disconnected, show a clear `Connect ChatGPT` action instead of an empty model dropdown.
3. Default to browser flow. The click calls the backend and then opens the returned `authUrl` in a new tab.
4. Show `Waiting for OpenAI…` with Cancel and `Use device code instead`.
5. Device mode shows verification URL, copyable code, expiry, and Open button.
6. On completion, show connected email/plan when available and load the live model catalog.
7. Model combobox supports search, keyboard selection, provider/model labels, default badge, optional model description, and reasoning effort only when the selected model supports it.
8. Errors state exactly whether Codex is missing, authentication expired, login was cancelled, or the catalog failed.

**Security:** Never render or log any token. Open URLs only after a direct user gesture. Use `noopener,noreferrer`. Never auto-logout the shared Codex account.

### Task 10: Redesign generation history and job detail

**Objective:** Bring monitoring and output review to the same visual standard as creation.

**Files:**
- Modify: `web/src/components/JobCard.jsx`
- Modify: `web/src/components/JobStatusBadge.jsx`
- Modify: `web/src/components/ProgressBar.jsx`
- Modify: `web/src/components/VideoPlayer.jsx`
- Modify: `web/src/pages/JobDetail.jsx`
- Create: `web/src/components/GenerationMetadata.jsx`
- Create: `web/src/styles/jobs.css`

**Behavior:**
- Use media-card layouts with stable aspect-ratio placeholders.
- Expose composing, linting, rendering, done, failed, and cancelled as human-readable stages.
- Show provider/model metadata for new jobs and graceful `Legacy job` treatment for old records.
- Keep asset-use warnings prominent but not visually confused with render failures.
- Make Cancel a destructive secondary action with confirmation only when work is actively running.
- Keep Download MP4 as the primary completed-job action.

### Task 11: Integration, failure-path, and visual verification

**Objective:** Prove the whole app works, not just isolated mocks.

**Backend checks:**

```bash
npm --prefix server test
node --check server/src/index.js
node --check server/src/providers/codexAppServer.js
node --check server/src/composer/executors/codex.js
```

**Frontend checks:**

```bash
npm --prefix web run test
npm --prefix web run lint
npm --prefix web run build
```

**Full check:**

```bash
npm run check
```

**Read-only live Codex smoke test:**
- Start the app-server client.
- Call `account/read` against the already logged-in laptop account.
- Call `model/list` and verify at least one selectable model.
- Do not logout, rotate credentials, or force a new login during automated verification.

**Real generation smoke test:**
- Create a short 5-second Codex job using a selected live model and a throwaway uploaded asset.
- Verify job reaches `done`, `index.html` includes required HyperFrames markers, output MP4 exists, and asset diagnostics are accurate.
- Record the actual job ID/output path in session results only, not persistent memory.

**Browser verification:**
- Desktop: 1440×900
- Tablet: 1024×768
- Mobile: 390×844
- Check no horizontal overflow, readable contrast, modal focus, keyboard model selection, upload previews, pending login UI, disconnected UI, empty history, active job, failed job, and completed output.
- Use screenshot comparison or Playwright assertions for stable layout properties; do not use fragile pixel-perfect snapshots for dynamic media.

**Failure paths:**
- Codex binary missing
- Disconnected account
- OAuth cancelled/expired
- App-server crashes mid-request
- Model removed between selection and submit
- Quota/rate-limit failure
- OpenCode catalog unavailable
- Asset upload failure
- Codex exits without producing `index.html`
- Render cancellation

### Task 12: Documentation, startup, and rollout

**Objective:** Leave the app understandable and reproducible.

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` only if new architecture rules are needed
- Modify carefully: `server/.env.example`
- Modify: root `package.json`
- Modify: `server/package.json`
- Modify: `web/package.json`

**Document:**
- Codex prerequisite and `codex login status`
- OAuth connection flow inside the UI
- Difference between ChatGPT/Codex OAuth and OpenAI API keys
- Local-only security boundary
- `CODEX_BIN` override
- Provider/model troubleshooting
- Exact dev/start/test commands
- Why tokens are owned by Codex and never stored by this app

**Restart/verify:**
1. Stop only the known AI UGC Maker server/web PIDs.
2. Restart both services detached on the laptop.
3. Verify `GET /api/health`, `GET /api/providers`, provider-scoped models, frontend title/content, and both listeners.
4. Confirm the Git working tree still contains all pre-existing dirty work plus only the intentional feature changes.

## 6. Files likely to change

Backend:
- `server/src/index.js`
- `server/src/config.js`
- `server/src/jobs.js`
- `server/src/jobs.test.js`
- `server/src/jobRunner.js`
- `server/src/composer/index.js`
- `server/src/composer/agent.js`
- `server/src/composer/executors/codex.js`
- `server/src/composer/executors/opencode.js`
- `server/src/providers/index.js`
- `server/src/providers/codexAppServer.js`
- `server/src/providers/codexProvider.js`
- `server/src/providers/opencodeProvider.js`
- `server/src/routes/providers.js`
- Corresponding `*.test.js` files

Frontend:
- `web/src/App.jsx`
- `web/src/main.jsx`
- `web/src/api/client.js`
- `web/src/pages/Home.jsx`
- `web/src/pages/JobDetail.jsx`
- Existing shared job/upload/form components
- New `web/src/components/ui/`, `studio/`, and `providers/` components
- New `web/src/hooks/useProviders.js`, `useProviderModels.js`, `useCodexLogin.js`
- New `web/src/styles/` stylesheets
- Frontend tests and test setup

Project/docs:
- `package.json`
- `server/package.json`
- `web/package.json`
- `server/.env.example`
- `README.md`
- `AGENTS.md`
- `DESIGN.md`

## 7. Main risks and mitigations

1. **Shared Codex account disruption**
   - Mitigation: no automatic logout, no direct auth-file reads, no test credential rotation. Codex owns refresh and persistence.

2. **Experimental app-server protocol drift**
   - Mitigation: generate/store no copied token logic; isolate protocol in one adapter; test against the installed CLI; use runtime capability errors; document minimum Codex version.

3. **Provider model availability changes**
   - Mitigation: dynamic `model/list`, short cache, validation at submission, and a visible refresh/error state. Never hardcode a supposedly permanent catalog.

4. **Dirty-file collisions**
   - Mitigation: targeted diffs, small patches, explicit staging, and tests after every overlapping edit. Never replace `jobRunner.js`, `jobs.js`, package manifests, or transcript work wholesale.

5. **OAuth exposed beyond localhost**
   - Mitigation: loopback-only auth mutation routes and fail closed if the app is rebound to LAN without a control token.

6. **Codex agent writes outside the job workspace**
   - Mitigation: `--cd <jobDir>`, `workspace-write` sandbox, no bypass flags, ephemeral session, and output validation.

7. **UI overhaul breaks working generation behavior**
   - Mitigation: lock API/form behavior with tests first, refactor by component, and verify a real end-to-end render before removing legacy styling.

8. **Frontend becomes visually modern but operationally vague**
   - Mitigation: every state has explicit text; no fake features; provider, model, assets, stage, errors, and output remain visible.

## 8. Definition of done

The overhaul is complete only when:
- OpenAI Codex appears as a provider even when disconnected.
- The app can initiate browser OAuth and device-code fallback through Codex app-server.
- The app reports connection status without exposing tokens.
- The model dropdown is populated from Codex `model/list` and scoped to the selected provider.
- A selected Codex model can generate a valid HyperFrames composition and render an MP4.
- Existing OpenCode and template modes still work.
- Existing stored jobs and local draft data still render safely.
- The UI is a polished responsive creation studio at desktop/tablet/mobile sizes.
- No nonfunctional creator features were added.
- Backend tests, frontend tests, lint, build, and a real local generation smoke test pass.
- The existing dirty laptop work is preserved and clearly separated from feature changes.
