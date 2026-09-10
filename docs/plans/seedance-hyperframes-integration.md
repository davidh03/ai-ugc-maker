# Seedance + HyperFrames Integration Plan

> Implementation plan only. Seedance remains optional and must not alter the existing path when disabled.

Goal: use Seedance for selected generative shots while HyperFrames remains the deterministic final compositor.

Architecture:

```text
brief/assets/narration
  -> scene planner
  -> optional Seedance shot provider
  -> validated local shot assets
  -> HyperFrames HTML/timeline composition
  -> render and audio mix
  -> immediate downloadable video
  -> asynchronous AI reviewer
  -> optional targeted child revision
```

## Safety boundary

- `seedance.enabled=false` must preserve the current generation path.
- Seedance must never render the whole explainer in the first release.
- HyperFrames continues to own screenshots, logos, captions, timing, narration, audio, branding and final MP4 output.
- Generated shots are treated as untrusted media and cannot replace controlled text or brand assets.
- No provider call occurs without an explicit feature flag, configured credential and spend limit.

## Implementation stages

### 1. Stabilize existing pipeline first

Resolve the current artifact, reviewer, persistence and cancellation fixes before adding a paid provider. The release gate is trustworthy `done`, immutable parent output, bounded review and restart-safe correction state.

### 2. Add provider-neutral shot contract

Create a server-side interface such as:

```js
generateShot({
  prompt,
  referenceImages,
  referenceVideos,
  referenceAudio,
  durationSec,
  aspectRatio,
  model,
  idempotencyKey,
})
```

The contract returns a task ID and normalized status. Do not expose provider credentials or raw provider payloads to the browser.

Likely files:

- `server/src/videoProviders/index.js`
- `server/src/videoProviders/seedance.js`
- `server/src/videoProviders/seedance.test.js`
- `server/src/jobs.js`
- `server/src/config.js`

### 3. Persist asynchronous task state

Persist provider name, model ID, task ID, request hash, status, attempt count, timestamps and local artifact path. Submission must be idempotent so a worker restart cannot create duplicate paid requests.

### 4. Submit and poll Seedance tasks

Implement create-task, bounded polling, timeout, provider error handling, download, checksum and media validation. Validate that the result contains a playable video stream and a duration within the allowed tolerance.

Model IDs and limits must come from the active BytePlus ModelArk account/catalog, not assumptions in code.

### 5. Insert one shot into HyperFrames

Convert a completed local clip into a timed video asset in the existing composition. Preserve aspect ratio and keep the generated clip muted unless the user explicitly requests shot audio. Narration timing remains authoritative.

### 6. Add room controls

Expose opt-in controls for:

- enable/disable Seedance
- target scene/shot
- model
- duration/aspect ratio
- reference assets
- maximum provider attempts
- maximum spend or manual approval

Show task status, provider errors, clip preview and the relationship between shot and final video.

### 7. Connect reviewer corrections safely

Map reviewer findings to a typed repair plan:

- generated-shot defect → rerun only the affected Seedance shot
- composition defect → rerun HyperFrames composition
- narration defect → rerun TTS and dependent timing
- audio-mix defect → rerun mix only
- caption/branding defect → rerun controlled composition layer

Every correction creates a child job. Never overwrite the parent or promote a rejected child.

### 8. Verification gates

- Unit tests for provider normalization, idempotency and limits.
- Mocked task lifecycle tests: submitted, polling, completed, failed and timed out.
- Local five-second clip assembly with a real MP4 and `ffprobe` validation.
- Test that Seedance-disabled jobs make zero provider calls.
- Test that a shot failure leaves the original job available.
- Test that only the affected shot is regenerated.
- One deliberately defective clip and one genuinely different corrected artifact.
- One separately approved live provider test with a strict budget.

## Rollout

1. Feature flag and mocked provider.
2. One manually selected shot per job.
3. Review-only mode.
4. Opt-in automatic shot correction, capped at three reviewer iterations.
5. Multi-shot generation only after cost, timing and artifact metrics are reliable.

## Risks

- Provider availability, account region and model IDs may change.
- Generated clips may contain unwanted text, logos or visual drift.
- Async paid tasks can be duplicated without idempotency.
- Large media files need object storage before horizontal scaling.
- Seedance output duration may not match narration; never solve that by silently speeding up speech.

Acceptance: a normal job behaves exactly as before when the flag is off, and an enabled job produces a validated Seedance shot that HyperFrames assembles into the final downloadable MP4.
