# Intelligent UGC Revision Workspace Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task, with specification review followed by code-quality review. Preserve the laptop repository's existing dirty work; do not reset, overwrite, or commit unrelated changes.

**Goal:** Replace manual revision-scope checkboxes with an intelligent, version-aware revision workspace that inherits the complete generation setup, detects changes from both natural-language instructions and edited settings, visibly marks every affected factor, and reruns only the minimum safe portion of the video pipeline.

**Architecture:** Treat every original generation and its revisions as one immutable generation room. A revision editor loads the selected version's effective settings and assets into the same shared editor used for new generations. An AI intent analyzer converts the user's revision instruction into a structured change set; a deterministic diff/impact planner merges that with explicit UI edits and decides which artifacts can be reused. The model may classify intent, but it must never directly decide stage reuse. Each revision is an immutable child job with a saved settings snapshot, change provenance, artifact manifest, and stage plan.

**Tech Stack:** React 19 + React Router, Express 5, Node's built-in test runner, existing AI-composer/provider adapters, HyperFrames, ffmpeg/ffprobe, existing JSON job store.

---

## Product contract

### The user experience

1. Opening a successful generation enters a persistent revision room, not a stripped-down rerun form.
2. The source video remains visible in a sticky **Preview / Output workspace** while the right side uses the same generation controls as **New Generation**.
3. The user writes only what should change, for example:
   - “Change the background from purple to blue.”
   - “Replace the second narration sentence with ‘Book your free audit today.’”
   - “Use Trustworthy man, but keep the script and visuals exactly the same.”
4. The user never manually chooses a rerun scope.
5. The system detects impacted factors from the instruction and from actual control edits.
6. Every involved field displays an indicator with provenance:
   - `Changed manually`
   - `Detected from instruction`
   - `Required dependency`
   - `Inherited / unchanged`
7. Before submission, a compact **Revision impact** panel explains what will change, what will be reused, and which stages will run.
8. Unchanged room settings are inherited from the selected source version. They are tracked as changed only after the user edits them.
9. The original prompt is always easy to reveal and copy. It is read-only and visually distinct from the revision instruction.
10. Submitting creates a new immutable version. The original and prior revisions remain playable and comparable.

### Safety rules

- Explicit form changes override instruction-derived guesses.
- An instruction may identify an affected factor without silently inventing a new control value. Example: “make the voice friendlier” marks voice as affected, but if no exact voice is selected the existing voice remains selected and the composer/TTS instruction carries the qualitative request.
- If the instruction conflicts with a manual setting, show the conflict and use the manual value.
- Low-confidence classifications must be shown as `Needs review`; they must not trigger destructive asset removal or broad full-video regeneration without a visible warning.
- Stage reuse is based only on deterministic dependency rules plus verified source artifacts.
- If a required source artifact is missing, rerun its producer stage and tell the user why.
- Never mutate the source job, source MP4, source prompt, source settings snapshot, thumbnail, narration, or asset list.

---

## Change model and data contracts

### Canonical editable settings

Create one shared schema for:

```js
{
  brief,
  durationSec,
  style,
  music,
  voiceover,
  voiceoverProvider,
  voiceoverVoice,
  composer,
  provider,
  model,
  reasoningEffort,
  assets
}
```

New-generation drafts may still use local storage. Revision rooms must initialize from the selected source job's saved `effectiveSettings` and must not be overwritten by the global new-generation draft.

### Structured revision analysis

The AI analyzer should return validated JSON shaped like:

```js
{
  schemaVersion: 1,
  factors: [
    {
      id: 'narration.text',
      operation: 'replace',
      target: { type: 'sentence', value: 'second sentence' },
      requestedValue: 'Book your free audit today.',
      preserve: ['all other narration', 'visuals', 'timing'],
      evidence: 'Replace the second narration sentence...',
      confidence: 0.98
    }
  ],
  preserve: ['unspecified content'],
  ambiguities: []
}
```

Allowed factor families should be enumerated and validated, not free-form:

- `brief.content`
- `visual.design`
- `visual.scene`
- `asset.add`, `asset.remove`, `asset.replace`, `asset.requirement`
- `narration.text`, `narration.voice`, `narration.provider`, `narration.enabled`
- `music.track`, `music.enabled`, `music.level`
- `timing.scene`, `timing.totalDuration`
- `format.style`
- `composer.engine`, `composer.provider`, `composer.model`
- `caption.text`
- `cta.text`

### Merged change set

Persist the merged, server-authoritative result:

```js
{
  instruction,
  factors: [
    {
      id,
      source: 'manual' | 'instruction' | 'dependency',
      before,
      after,
      evidence,
      confidence,
      status: 'confirmed' | 'needs-review'
    }
  ],
  settingsDiff,
  assetDiff,
  conflicts,
  stagePlan,
  analyzer: { provider, model, schemaVersion }
}
```

### Stage plan

Each workflow node receives more than a status:

```js
{
  id: 'voiceover',
  action: 'rerun' | 'reuse' | 'skip',
  reason: 'Narration sentence changed',
  causedBy: ['narration.text'],
  sourceJobId: 'abc12345',
  sourceArtifact: 'voiceover.mp3'
}
```

The UI uses `causedBy` and `reason` for the “factor involved” indicator and pipeline impact explanation.

### Artifact manifest

Persist job-scoped artifact metadata so reuse is provable:

```js
{
  compositionHtml: { relPath, sha256, sourceJobId },
  cleanVideo: { relPath, sha256, durationSec, sourceJobId },
  voiceoverAudio: { relPath, sha256, durationSec, sourceJobId },
  narrationTiming: { relPath, sha256, sourceJobId },
  musicAudio: { relPath, sha256, durationSec, sourceJobId },
  finalVideo: { relPath, sha256, durationSec, sourceJobId },
  thumbnail: { relPath, sha256, sourceJobId }
}
```

Do not store secrets in this manifest.

---

## Deterministic impact matrix

The AI identifies intent. `revisionPlanner.js` owns this matrix and remains the sole authority for execution:

| Change factor | Reuse | Rerun |
|---|---|---|
| Voice/provider only | composition HTML, clean visual render, assets, music source | TTS, narration timing if needed, final audio mix |
| One narration sentence, no burned-in captions, duration still fits | visual composition, clean visual render, assets, music source | script patch, TTS, narration timing, final audio mix |
| Narration text with burned-in captions or timing overflow | assets, unchanged analysis, music source | composition patch, lint, render, TTS, timing, final mix |
| Music toggle/track/level only | composition, clean visual render, voiceover | music preparation and final mix |
| Color/design/scene visual change | unchanged asset analysis, voiceover, music source | composition patch, lint, render, final mix |
| Add/remove/replace asset | unaffected asset analyses, voiceover if narration unchanged | changed-asset analysis, composition patch, lint, render, final mix |
| Duration, format, composer engine/provider/model | safe source assets only | optimizer/composer and all downstream dependent stages |
| CTA or caption text | voiceover only if spoken text is unchanged | composition patch, lint, render, final mix |

Additional rules:

- Preserve a clean, video-only render before audio mixing. Otherwise audio-only revisions cannot avoid visual regeneration.
- For historical jobs without `cleanVideo`, fall back to compose/render and show: `Visual rerender required: reusable clean render was not saved for this version.`
- A sentence-level narration replacement must patch the saved approved narration script, not regenerate the entire script.
- Measure synthesized narration before finalizing the plan. If the replacement no longer fits its timing window, surface the timing dependency and recompose only the affected scene/captions.
- If captions are burned into the video and mirror narration, narration text necessarily affects visual render.
- A visual-only request must preserve and reuse the exact approved narration audio and timing metadata when present.
- Asset hashes, not filenames alone, determine whether an asset is unchanged.

---

## Target desktop UI

### Wide layout

```text
┌──────────────────────────────┬────────────────────────────────────┐
│ Preview / Output workspace   │ Revise Version 3                   │
│ sticky video player          │ What should change?                │
│ current version + status     │ [revision instruction textarea]    │
│ version thumbnail strip      │                                    │
│ original prompt ▾ [Copy]     │ Creative settings                  │
│                              │ Duration | Format | Composer        │
│                              │ Assets                              │
│                              │ Audio                               │
│                              │ Advanced AI settings ▾             │
│                              │                                    │
│                              │ Revision impact                     │
│                              │ [Create Version 4]                  │
└──────────────────────────────┴────────────────────────────────────┘
```

### Responsive layout

Below the desktop breakpoint, stack preview above the editor. Keep a compact sticky action bar containing pending-change count and `Create revision`. Do not make the video player permanently occupy most of a phone viewport.

### Visual cleanup

- Replace the single dense panel with clearly separated sections using consistent 24px section gaps and 12–16px internal gaps.
- Keep the decorative background outside the form surface; increase form-surface opacity and label contrast.
- Move provider/model into an **Advanced AI settings** disclosure.
- Keep voice provider and voice visible only when voiceover is enabled.
- Show inherited fields normally but quietly; only changed/affected controls receive colored rails or badges.
- Use text plus icon, never color alone:
  - purple `Changed manually`
  - cyan `Detected from instruction`
  - amber `Required dependency`
  - muted `Inherited`
- Place one concise revision-impact summary immediately above the primary action.
- Rename the action to `Create Version N` or `Generate revision`, never `Rerun`.

### Original prompt

- Add an `Original prompt` read-only disclosure under the preview/version metadata.
- Preserve line breaks.
- Add a labeled `Copy prompt` button.
- Use `navigator.clipboard.writeText`, a temporary `Copied` state, and an accessible live region.
- Fall back to a selected read-only textarea plus `document.execCommand('copy')` only when the Clipboard API is unavailable.
- Display the root generation prompt, not the concatenated internal revision brief.

---

## Implementation tasks

### Task 1: Freeze the current contract and protect dirty work

**Objective:** Capture the existing behavior before refactoring and prevent accidental destruction of unrelated laptop changes.

**Files:**
- Read: all currently modified files shown by `git status --short`
- Modify only tests in this task: `server/src/jobs.test.js`, `server/src/workflow.test.js`

**Steps:**

1. Record `git status --short`, current branch, `HEAD`, and upstream divergence.
2. Save a patch or stash-like backup outside the worktree without changing index/worktree state.
3. Add characterization tests proving:
   - revisions inherit all settings by default;
   - parent objects remain byte-for-byte unchanged;
   - revision numbers are allocated within the root family;
   - existing `reused` workflow status renders and persists.
4. Run `npm test` and confirm the new characterization tests pass before refactoring.
5. Do not commit unless the user explicitly requests commits; if committing later, stage only named files.

### Task 2: Define canonical generation settings and immutable snapshots

**Objective:** Make New Generation and revision rooms use one normalized settings contract.

**Files:**
- Create: `server/src/generationSettings.js`
- Create: `server/src/generationSettings.test.js`
- Modify: `server/src/jobs.js`
- Modify: `server/src/store.js` only if normalization occurs during load

**Steps:**

1. Write failing tests for normalization, safe defaults, omission of secrets, and deep cloning.
2. Implement `normalizeGenerationSettings(input)` and `snapshotGenerationSettings(job)`.
3. Add `effectiveSettings` to new jobs.
4. For historical jobs, derive `effectiveSettings` on read without pretending it was originally persisted.
5. Ensure arrays and asset objects are cloned so a child cannot mutate a parent through shared references.
6. Run `npm test`; expect all server tests to pass.

### Task 3: Implement deterministic settings and asset diffs

**Objective:** Track only settings actually changed in the current room.

**Files:**
- Create: `server/src/revisionDiff.js`
- Create: `server/src/revisionDiff.test.js`
- Create: `web/src/lib/revisionDiff.js`
- Create: `web/src/lib/revisionDiff.test.js`
- Modify: `web/package.json` to add a minimal frontend unit-test script if needed

**Steps:**

1. Test equal settings, booleans, provider/voice pairs, composer/provider/model pairs, and reverted values.
2. Test asset add/remove/replace/required-state changes using stable asset IDs plus content hash.
3. Implement a shared field-name convention so client preview and server validation agree.
4. Ensure changing a field and changing it back removes the pending indicator.
5. Ensure global local-storage defaults never appear as revision changes.
6. Run the server tests and the new web unit tests.

### Task 4: Build the AI revision-intent analyzer

**Objective:** Infer affected factors and precise targets from natural-language instructions without asking users to select rerun scope.

**Files:**
- Create: `server/src/revisionIntent.js`
- Create: `server/src/revisionIntent.test.js`
- Modify: existing provider invocation helpers only if required for reusable structured output

**Steps:**

1. Define an allow-listed JSON schema for factor IDs, operations, targets, requested values, preserve clauses, evidence spans, confidence, and ambiguities.
2. Write mocked-provider tests for:
   - visual color-only change;
   - one narration sentence replacement;
   - voice-only change;
   - music-only change;
   - asset replacement;
   - combined visual + narration request;
   - explicit “keep everything else” preservation;
   - vague request such as “make it better.”
3. Prompt the analyzer with source metadata and revision instruction, not provider credentials or raw binary assets.
4. Reject unknown factors and malformed JSON.
5. Add a conservative lexical fallback when the analyzer is unavailable; return `needs-review` rather than silently defaulting to `visuals`.
6. Preserve sanitized provider errors for diagnostics.
7. Run `npm test`; all mocked cases must pass without paid provider calls.

### Task 5: Merge instruction intent with manual edits

**Objective:** Produce one authoritative change set with understandable provenance and conflict handling.

**Files:**
- Create: `server/src/revisionChangeSet.js`
- Create: `server/src/revisionChangeSet.test.js`

**Steps:**

1. Write tests proving manual diffs override inferred control values.
2. Write tests proving instruction-only factors remain present even when they have no direct form field.
3. Detect contradictions, such as instruction “disable music” while the user manually enables it.
4. Mark qualitative requests without invented values, such as “friendlier voice.”
5. Preserve source settings for every untouched field.
6. Return stable ordering so the UI does not reorder badges between analysis responses.
7. Run `npm test`.

### Task 6: Create the deterministic dependency planner

**Objective:** Convert the merged change set into safe reuse/rerun/skip decisions.

**Files:**
- Create: `server/src/revisionPlanner.js`
- Create: `server/src/revisionPlanner.test.js`
- Modify: `server/src/workflow.js`
- Modify: `server/src/workflow.test.js`

**Steps:**

1. Encode the impact matrix from this plan as explicit rules.
2. Test each factor independently and in combinations.
3. Add dependency reasons and `causedBy` to workflow nodes.
4. Verify missing artifacts force rerun and include a visible fallback reason.
5. Verify disabled optional stages remain `skip`, not `reuse` or `done`.
6. Verify the model's output cannot inject stage actions.
7. Add `action` and `reason` while retaining compatible `status` values for active jobs.
8. Run `npm test`.

### Task 7: Persist artifact manifests and clean render outputs

**Objective:** Make audio-only and other selective revisions technically possible.

**Files:**
- Create: `server/src/artifactManifest.js`
- Create: `server/src/artifactManifest.test.js`
- Modify: `server/src/jobRunner.js`
- Modify: `server/src/jobRunner.test.js`
- Modify: media output/mixing helpers used by `jobRunner.js`

**Steps:**

1. Write tests for manifests, hashes, inherited source references, and missing-file detection.
2. Preserve the clean visual render separately before voice/music mixing.
3. Store final output separately from clean render.
4. Record voiceover audio, timing metadata, music source, composition HTML, thumbnail, and final output.
5. Verify artifact existence and checksum before marking a stage reusable.
6. Do not duplicate immutable files unnecessarily; copy/link into child directories only where the current runtime requires job-local paths.
7. Add historical fallback behavior without fabricating manifests.
8. Run `npm test` and inspect a fixture job's manifest.

### Task 8: Add a side-effect-free revision-plan API

**Objective:** Let the UI preview inferred changes and pipeline impact before creating a paid/rendering job.

**Files:**
- Modify: `server/src/index.js`
- Create: `server/src/revisionApi.test.js` or extend `server/src/jobs.test.js`
- Modify: `web/src/api/client.js`

**Endpoint:**

```text
POST /api/jobs/:id/revision-plan
{
  instruction,
  settings,
  assets
}
```

**Response:**

```text
{
  sourceJobId,
  baselineVersion,
  settingsDiff,
  assetDiff,
  changeSet,
  stagePlan,
  planHash
}
```

**Steps:**

1. Test missing/blank instruction, missing source, unsupported source status, and malformed settings.
2. Confirm this endpoint creates no job and mutates no source record.
3. Debounce UI requests and cancel stale requests with `AbortController`.
4. Return analyzer confidence and actionable ambiguity messages.
5. Hash the normalized source version + inputs + plan so creation can detect stale plans.
6. Run `npm test`.

### Task 9: Make revision creation server-authoritative

**Objective:** Create immutable child versions from a validated plan, not client-provided rerun flags.

**Files:**
- Modify: `server/src/jobs.js`
- Modify: `server/src/jobs.test.js`
- Modify: `server/src/index.js`

**Steps:**

1. Remove `changedFields` as an authoritative client input.
2. Accept `instruction`, full effective settings/assets, and optional `planHash`.
3. Recompute or validate the plan server-side.
4. Persist `revisionInstruction`, `effectiveSettings`, `settingsDiff`, `assetDiff`, `changeSet`, `stagePlan`, `parentJobId`, `sourceJobId`, and `revisionNumber`.
5. Keep `originalBrief` as the root user's prompt and store internal composer instructions separately.
6. Test that source records and artifacts remain unchanged.
7. Test stale plan hashes return a clear conflict response and refreshed plan.
8. Run `npm test`.

### Task 10: Execute revisions according to the plan

**Objective:** Patch/reuse the minimum safe artifacts instead of treating every revision as a new full generation.

**Files:**
- Modify: `server/src/jobRunner.js`
- Modify: `server/src/jobRunner.test.js`
- Modify: `server/src/composer/agent.js`
- Modify: `server/src/composer/agent.test.js`
- Modify: `server/src/scriptParser.js` only where targeted narration patching needs structured sentence/scene IDs

**Steps:**

1. Replace unconditional sequential execution with stage-plan guards.
2. Add reusable artifact hydration that marks workflow nodes `reused` only after verification.
3. Pass the source composition plus structured patch instruction to the composer for visual/scene changes.
4. Add targeted narration operations against the approved narration script.
5. Preserve all unmentioned sentences byte-for-byte.
6. Regenerate TTS only for the changed narration output; reuse visual render when timing/captions permit.
7. Recompose only the affected scene when captions or timing make a visual rerender necessary.
8. Preserve cancellation checks across every newly conditional boundary.
9. Test visual-only, voice-only, sentence-only, music-only, missing-artifact fallback, and combined-change jobs.
10. Run `npm test`.

### Task 11: Refactor New Generation into a reusable editor

**Objective:** Give new and revision flows the same settings UI without duplicating state logic.

**Files:**
- Create: `web/src/components/GenerationEditor.jsx`
- Create: `web/src/components/GenerationSettings.jsx`
- Modify: `web/src/components/PromptForm.jsx`
- Modify: `web/src/components/AssetUpload.jsx`
- Modify: `web/src/pages/Home.jsx`

**Steps:**

1. Extract controlled generation fields from `PromptForm`.
2. Support `mode="create" | "revision"`, controlled values, baseline values, field indicators, and reset-to-inherited actions.
3. Keep local-storage persistence only in create mode.
4. In revision mode, initialize from the selected job's `effectiveSettings`.
5. Keep all current choices editable: duration, format, composer, assets, AI provider/model, music, voiceover, voice provider, and voice.
6. Group controls into Creative, Assets, Audio, and Advanced AI sections.
7. Verify changing voice provider resets voice only when the provider truly changes and marks both appropriate fields.
8. Run frontend lint/build and component tests.

### Task 12: Build the revision workspace UI

**Objective:** Replace manual rerun scope with the foolproof two-column revision experience.

**Files:**
- Rewrite revision portion of: `web/src/pages/JobDetail.jsx`
- Create: `web/src/components/RevisionWorkspace.jsx`
- Create: `web/src/components/RevisionInstruction.jsx`
- Create: `web/src/components/RevisionImpact.jsx`
- Create: `web/src/components/FieldChangeIndicator.jsx`
- Create: `web/src/hooks/useRevisionPlan.js`
- Modify: `web/src/styles.css`

**Steps:**

1. Delete `changedFields`, `toggleField`, and all rerun-scope checkboxes.
2. Add a sticky left preview/output column with current version metadata.
3. Add a dominant `What should change?` field above the inherited editor.
4. Debounce analysis after a meaningful instruction or setting edit.
5. Render factor chips with provenance, evidence, and confidence.
6. Mark affected controls directly; allow reset for manual changes.
7. Show `Will rerun`, `Will reuse`, and `Will stay off` stage groups with reasons.
8. Disable submission while analysis is stale, loading, contradictory, or missing required review.
9. Use `Create Version N` as the primary action.
10. Keep failed analysis recoverable: the user can retry; the system must not silently assume `visuals`.
11. Add responsive layout and accessible focus/error states.
12. Run lint/build and verify at desktop and narrow viewport widths.

### Task 13: Add original-prompt copy and version-aware history

**Objective:** Make source context easy to retrieve while preserving revision focus.

**Files:**
- Create: `web/src/components/OriginalPrompt.jsx`
- Create: `web/src/components/VersionHistory.jsx`
- Modify: `web/src/pages/JobDetail.jsx`
- Modify: `web/src/styles.css`
- Modify backend listing/detail shape only if root prompt or thumbnails are absent

**Steps:**

1. Show the root original prompt in a read-only disclosure.
2. Add accessible copy behavior and `Copied` confirmation.
3. Never display the internal concatenated revision brief as the original prompt.
4. Show thumbnails, version numbers, status, short change summary, and current selection in history.
5. Make successful versions playable; visually distinguish running/failed/cancelled versions.
6. Add Preview and Compare links without mutating versions.
7. Run lint/build and manually verify clipboard behavior.

### Task 14: Upgrade pipeline visualization

**Objective:** Explain why each stage is involved in the current revision.

**Files:**
- Modify: `web/src/components/WorkflowGraph.jsx`
- Modify: `web/src/styles.css`
- Modify: `server/src/workflow.js` if serialization needs compatibility handling

**Steps:**

1. Display planned action before job creation and runtime status after creation.
2. Show `reused`, `rerun`, `skipped`, `running`, `done`, and `failed` with text and icon.
3. Add a concise reason under affected stages, for example `Rerun because narration sentence changed`.
4. Link field badges and stage reasons through the same factor IDs.
5. Keep historical jobs renderable when reason/action fields are absent.
6. Run tests, lint, and build.

### Task 15: End-to-end verification

**Objective:** Prove the product behaves like a selective UGC editor, not a full rerun form.

**Files:**
- Add/modify fixtures and tests as required
- No production provider call without explicit user approval

**Automated verification:**

1. Run `npm run check` from the repository root.
2. Expected: server tests pass, oxlint passes, and Vite production build succeeds.
3. Test the revision-plan endpoint does not create jobs.
4. Test parent JSON and artifacts remain byte-for-byte unchanged after child creation.
5. Test all stage-plan scenarios in the impact matrix.
6. Test failed/missing source artifacts trigger explicit rerun fallback.

**Browser verification:**

1. Start the app on the laptop with the existing project command.
2. Open a successful generation.
3. Verify the source video and revision form are visible together on a wide viewport.
4. Enter “Change the background from purple to blue.”
5. Confirm `visual.design` and compose/lint/render are marked; voiceover is marked reused.
6. Clear the instruction and enter a one-sentence narration replacement.
7. Confirm only narration/audio stages are planned unless captions/timing require render.
8. Manually change Voice to `Trustworthy man`; confirm it is marked `Changed manually` and instruction-derived factors remain separate.
9. Change the voice back; confirm the manual indicator disappears.
10. Expand Original prompt, copy it, and compare clipboard text exactly.
11. Verify version history thumbnails and navigation.
12. Verify responsive layout and keyboard navigation.

**Media verification for one authorized real revision:**

1. Create one low-cost revision only after user approval.
2. Verify source and child outputs both remain available.
3. Inspect child MP4 with `ffprobe` for video/audio streams and expected duration.
4. Verify reused artifact checksums match the source manifest.
5. Verify rerun artifact checksums and source IDs differ where expected.
6. Watch/listen to the affected segment and confirm unspecified content was preserved.

---

## Likely files changed

**Server**

- `server/src/index.js`
- `server/src/jobs.js`
- `server/src/jobs.test.js`
- `server/src/jobRunner.js`
- `server/src/jobRunner.test.js`
- `server/src/workflow.js`
- `server/src/workflow.test.js`
- `server/src/composer/agent.js`
- `server/src/composer/agent.test.js`
- `server/src/store.js` if load-time migration is needed
- New: `generationSettings.js`, `revisionDiff.js`, `revisionIntent.js`, `revisionChangeSet.js`, `revisionPlanner.js`, `artifactManifest.js` and tests

**Web**

- `web/src/pages/JobDetail.jsx`
- `web/src/pages/Home.jsx`
- `web/src/components/PromptForm.jsx`
- `web/src/components/AssetUpload.jsx`
- `web/src/components/WorkflowGraph.jsx`
- `web/src/api/client.js`
- `web/src/styles.css`
- New shared editor, revision workspace, change indicator, impact, original prompt, version history, diff helper, and revision-plan hook files listed above

---

## Acceptance criteria

- No manual rerun-scope checkboxes remain.
- Natural-language instructions produce a visible structured change summary.
- Editing a setting produces a manual change indicator; reverting removes it.
- Every planned rerun has a visible reason and factor.
- Unchanged settings and assets inherit exactly from the selected source version.
- New and revision flows expose the same relevant settings and voice choices.
- Voice-only, music-only, and eligible sentence-only revisions reuse the clean visual render.
- Visual-only revisions reuse unchanged narration audio and timing.
- Missing historical artifacts fall back safely and visibly.
- Original prompt is visible, read-only, and copyable.
- Parent versions remain immutable and playable.
- Version history displays successful thumbnails and truthful non-success states.
- `npm run check` passes.
- One authorized end-to-end revision is verified with browser inspection and `ffprobe`.

---

## Risks and tradeoffs

1. **Current outputs may not retain a clean visual render.** Historical revisions may require one visual rerender. New jobs must preserve clean render artifacts going forward.
2. **AI intent can be uncertain.** Structured validation, evidence spans, confidence, deterministic fallback, and manual-review states prevent the classifier from becoming an invisible authority.
3. **Narration timing can force visual work.** Sentence-only TTS reuse is safe only when timing fits and captions are not burned into the source render.
4. **Shared editor refactoring touches dirty files.** Implementation must inventory and preserve current uncommitted work, use targeted patches, and review the final diff carefully.
5. **Live intent analysis may be expensive or slow.** Debounce, cache by source/input hash, cancel stale requests, and allow a retry state. Do not invoke analysis on every keystroke.
6. **Room versus version semantics can confuse users.** The root job is the room identity; every child is immutable. The UI should say `Generation room` and `Version N`, not expose raw job IDs as the primary concept.

## Decisions intentionally made

- Keep full settings editable during revision.
- Remove manual rerun scope entirely.
- Use AI only for semantic intent extraction.
- Use deterministic code for stage dependency and reuse decisions.
- Treat manual control changes as authoritative.
- Save settings per immutable version, not as mutable global room state.
- Preserve original prompt separately from internal composition/revision instructions.
- Prefer transparent fallback reruns over unsafe partial output.
