# Revision Prompt Provenance and Asset-Enforced Rendering Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task. Preserve the laptop repository's existing dirty work. Do not reset, clean, commit, push, or overwrite unrelated changes.

**Goal:** Make revisions trustworthy: show the exact immutable prompt used for every generated revision, resolve natural-language targets such as outro/header/operator into concrete composition targets, enforce every required asset at the requested target, preserve unaffected source, and guarantee that final audio mixing cannot truncate a 60-second render.

**Architecture:** Separate user instruction, prompt provenance, target resolution, composition editing, and output validation. Store immutable `parentPrompt` and `effectiveRevisionPrompt` snapshots on the child job. Convert revision intent into explicit target bindings before composition, then apply deterministic source patches when safe or constrain the agent with validated selectors and required asset bindings. Reject or repair a composition when a required target/asset is missing. Treat clean-render duration and final-container duration as independent media gates.

**Tech Stack:** React 19, Express 5, Node test runner, existing HyperFrames SDK/CLI, existing Codex composer adapter, ffmpeg/ffprobe, existing JSON job store.

---

## Verified failure evidence for job `57f69416`

- Job status says `done`, but the user-visible acceptance criteria failed.
- Parent job: `502ecef4`; root generation: `5cd74083`; revision number: 5.
- Requested duration: 60 seconds.
- `clean-video.mp4`: 60.000 seconds.
- `voiceover.mp3`: 46.800 seconds.
- Final `output.mp4`: 50.000 seconds.
- The generated HTML contains an outro timeline label at 54 seconds and an outro scene intended to run through 60 seconds.
- Because the final MP4 ends at 50 seconds, the 54–60 second outro can never appear.
- The logo asset is referenced, but the top-left brand mark remains a generated `.brand-glyph` instead of the real logo image.
- Required assets:
  - `f640e996-cadre_crew_inc_logo.jpeg`
  - `4893a44e-gohighlevel_operator.png`
- Actual `assetsUsed` contains only the logo.
- `requiredAssetsNotUsed` contains `4893a44e-gohighlevel_operator.png`.
- The job was still marked `done` despite a required asset being unused.
- The operator image is a landscape PNG with a person against green; it needs a transparent derived cutout before a convincing “escaping the frame” treatment.
- `revisionContext.targetScenes` is empty. The intent analyzer failed to convert “outro,” “top left,” “ending part,” and “GoHighLevel operator” into concrete targets.
- Current generated scene IDs use forms such as `scene-6` and `scene-7`; the deterministic patcher currently assumes only `scene6`/`scene7`.
- Current UI’s `Copy revision prompt` copies the editable draft instruction, not the exact prompt used by the generated child.

---

## Product contract

### Prompt terminology

The UI must use three distinct concepts:

1. **Revision instruction**
   - Editable input before generation.
   - The user’s requested change only.
   - May offer `Copy draft instruction`, but must never be labeled `Copy revision prompt`.

2. **Parent prompt**
   - Read-only snapshot of the exact effective prompt used to create the selected parent version.
   - For an original generation, this is the original prompt.
   - For a revised parent, this is that parent version’s effective revision prompt—not automatically the root brief.
   - Copyable exactly.

3. **Revised prompt**
   - Read-only snapshot of the exact sanitized prompt actually sent to the composer for the generated child version.
   - Includes source/preservation constraints, resolved targets, asset bindings, requested duration, and revision instruction.
   - Available after child creation and immutable.
   - Copyable exactly.

### Revision correctness

A revision cannot be `done` merely because an MP4 exists. It is `done` only when:

- Every explicitly required asset is referenced.
- Every requested target binding is satisfied.
- Unchanged source regions pass preservation checks.
- Clean render duration matches `durationSec` within tolerance.
- Final MP4 duration matches `durationSec` within tolerance.
- Expected video/audio streams exist.
- An outro requested for 54–60 seconds is present in source and reachable in the final output.

---

## Canonical persisted data

Add an immutable prompt-provenance object to every new child job:

```js
promptProvenance: {
  schemaVersion: 1,
  parentJobId: '502ecef4',
  parentPrompt: '...',
  revisionInstruction: '...',
  effectiveRevisionPrompt: '...',
  createdAt: 1788969555012,
  sha256: {
    parentPrompt: '...',
    effectiveRevisionPrompt: '...'
  }
}
```

Add explicit target and asset bindings:

```js
revisionTargets: [
  { id: 'global.header-logo', selectorCandidates: ['.brand-pill img', '[data-name="header-logo"]'], source: 'top left part' },
  { id: 'scene.operator', scene: 6, selectorCandidates: ['#scene-6', '#scene6', '[data-name="operator-scene"]'], source: 'ending part ... GoHighLevel operator' },
  { id: 'scene.outro', scene: 7, timeRange: [54, 60], selectorCandidates: ['#scene-7', '#scene7', '[data-name="outro"]'], source: 'outro ... fill the 60 seconds' }
],
assetBindings: [
  { assetId: 'f640e996', targets: ['global.header-logo', 'scene.outro'], required: true },
  { assetId: '4893a44e', targets: ['scene.operator'], required: true, transform: 'green-screen-cutout' }
]
```

Persist validation evidence:

```js
revisionValidation: {
  sourcePreservation: { checked: true, untouchedTargets: [], mismatches: [] },
  assetBindings: [{ assetId, target, satisfied, selector, relPath }],
  timeline: { requestedSec: 60, sourceSec: 60, cleanRenderSec: 60, finalSec: 60 },
  streams: { video: true, audio: true },
  passed: true
}
```

Never persist provider credentials or secret environment values.

---

## Target resolution rules

Create a deterministic resolver that combines natural-language aliases with actual source inspection.

### Named target aliases

- `outro`, `ending`, `end card`, `final logo`, `last frame` → final scene/composition and timeline tail.
- `top left logo`, `logo next to Cadre Crew`, `header logo`, `brand mark` → global/header brand lockup.
- `operator`, `GoHighLevel operator`, `girl`, `woman`, `person frame` → scene containing operator/person semantics and/or configured operator scene.
- Explicit `Scene N` → scene N.

### Source resolver

Support scene IDs and metadata in this order:

1. `#scene-N`
2. `#sceneN`
3. `[data-name="scene-N"]`
4. Composition elements whose timing overlaps the resolved scene range.
5. Text/semantic match in element snapshots as a last read-only lookup.

Do not guess a writable target when no candidate resolves. Return a visible ambiguity and block generation or require user review.

### Multiple targets in one request

The request for job `57f69416` must resolve to three independent operations:

1. Header logo replacement with the Cadre Crew logo asset.
2. Operator scene image replacement with the uploaded operator asset plus cutout/3D framing treatment.
3. Outro enforcement from 54–60 seconds with the Cadre Crew logo asset.

Do not collapse all three into generic `visual.design` + `asset.replace` factors.

---

## Required-asset enforcement

### Before composition

- Assign stable asset IDs and target roles.
- Show a preflight table in the revision impact panel:
  - Asset
  - Required target
  - Planned transformation
  - Resolved scene/selector
- Block submission if an instruction references “the image I sent” but more than one newly uploaded image is ambiguous.
- When exactly one new asset was added in the room, bind it to the referenced semantic target automatically and display the binding for review.

### During composition

- Stage required assets with stable relative paths.
- Inject exact binding instructions into the effective revision prompt.
- Require the real logo image source at both header and outro targets; generated geometric placeholders do not satisfy the binding.
- Require the operator derived asset under the operator scene subtree.

### After composition

- Parse the composed HTML and validate each binding by target subtree, not by global filename occurrence.
- A filename somewhere in the document is insufficient.
- If a required binding is missing:
  1. Run one targeted deterministic repair when the selector is unambiguous.
  2. Revalidate.
  3. If still missing, mark the composition stage failed with a precise error.
- Never allow `requiredAssetsNotUsed.length > 0` on a `done` job.

---

## Operator cutout and 3D frame treatment

The uploaded operator PNG contains a green background. Preserve the original asset and create a job-scoped derived artifact:

```text
assets/derived/<job-id>/<asset-id>-cutout.png
```

Pipeline:

1. Detect the keyed green background from asset analysis.
2. Use ffmpeg/ImageMagick chroma-keying to create an alpha-channel PNG.
3. Verify the derived output has an alpha channel and non-empty foreground bounds.
4. Bind the derived cutout—not the green-screen original—to the operator target.
5. Compose the scene with:
   - frame/container using `overflow: visible` where appropriate;
   - the image extending beyond the frame edge;
   - foreground z-index above the frame border;
   - subtle shadow and parallax/scale motion;
   - safe clipping so the person does not overlap unrelated UI/copy.
6. Preserve the operator scene’s existing time range unless explicitly changed.

If chroma keying fails, block the “cutout/escaping frame” claim and display the preprocessing error instead of rendering the green rectangle.

---

## Outro and duration correctness

### Root cause to fix

The clean render is 60 seconds, but the final audio mix is 50 seconds. The current ffmpeg path uses shortest-stream behavior, allowing short audio to truncate the video before the 54-second outro.

### Mixing contract

- Video duration is authoritative.
- Remove output-truncating `-shortest` behavior from voice/music mix paths.
- Pad short voiceover with silence using `apad` or an equivalent filter.
- Loop/pad music to the requested duration where enabled.
- Map the complete clean video stream.
- Set final output duration explicitly to `job.durationSec`.
- Preserve narration-free outro by ensuring voiceover ends before 54 seconds and padding only with silence.

### Duration gates

After every mix:

- `ffprobe` clean video.
- `ffprobe` voiceover.
- `ffprobe` final output.
- Fail if `abs(finalDuration - job.durationSec) > 0.1` seconds.
- Fail if the final video is shorter than any required target’s end time.
- Persist the measured durations.

For `57f69416`, expected values after repair:

- Clean render: 60.0 seconds.
- Final MP4: 60.0 seconds.
- Outro visible: 54.0–60.0 seconds.
- Voiceover ends before 54.0 seconds.

---

## UI design

### Before generation

Keep the editable `Revision instruction` area.

- Rename current `Copy revision prompt` to `Copy draft instruction` or remove it.
- Show resolved targets and asset bindings beneath the instruction.
- Show blocking ambiguities before enabling `Create Version N`.

### After generation / on every saved version

In the left context column, show two stacked read-only disclosures:

1. **Parent prompt**
   - Read-only textarea/preformatted content.
   - `Copy parent prompt` button.
   - Parent version label/link.

2. **Revised prompt**
   - Read-only exact `effectiveRevisionPrompt` used by the child.
   - `Copy revised prompt` button.
   - Hash/created timestamp may appear as subdued metadata.

Below them, show a compact `Revision instruction` summary for readability, but do not substitute it for the revised prompt.

### Validation presentation

Add a `Revision validation` card:

- Duration: `60.0 / 60.0 sec` with pass/fail.
- Required assets: `2 / 2 used at requested targets`.
- Preserved regions: count and status.
- Outro: `54–60 sec present`.
- Streams: video/audio.

A failed validation should keep the job visibly failed or `needs attention`; never show it as a normal successful generation.

---

## Implementation tasks

### Task 1: Add failure characterization tests

**Files:**
- Modify: `server/src/jobRunner.test.js`
- Modify: `server/src/compositionPatcher.test.js`
- Create: `server/src/revisionValidation.test.js`

**Tests:**

- Final audio shorter than video must not truncate output.
- `scene-6` and `scene-7` resolve correctly.
- “outro,” “top-left logo,” and “operator” resolve into distinct targets.
- Required asset referenced outside the requested target fails validation.
- `requiredAssetsNotUsed` prevents `done`.
- Parent job remains unchanged.

Run the focused tests first and confirm they fail for the current implementation.

### Task 2: Implement semantic target resolution

**Files:**
- Create: `server/src/revisionTargetResolver.js`
- Create: `server/src/revisionTargetResolver.test.js`
- Modify: `server/src/revisionIntent.js`
- Modify: `server/src/revisionChangeSet.js`

**Steps:**

- Add alias table and source DOM/composition inspection.
- Support hyphenated and unhyphenated scene IDs.
- Resolve all three targets from the exact `57f69416` instruction.
- Return ambiguities instead of generic guesses.
- Attach target IDs to each factor.

### Task 3: Build explicit asset bindings

**Files:**
- Create: `server/src/revisionAssetBindings.js`
- Create: `server/src/revisionAssetBindings.test.js`
- Modify: `server/src/revisionPlanner.js`
- Modify: `server/src/jobs.js`
- Modify: `server/src/index.js`

**Steps:**

- Diff parent/child assets using IDs/paths.
- Bind the sole new image to the referenced operator target.
- Bind the existing Cadre Crew logo to header and outro.
- Include bindings in revision-plan response and child job.
- Block ambiguous “image I sent” requests.

### Task 4: Add operator asset preprocessing

**Files:**
- Create: `server/src/assetTransforms.js`
- Create: `server/src/assetTransforms.test.js`
- Modify: `server/src/jobRunner.js`

**Steps:**

- Add green-screen-to-alpha transform.
- Save derived job-scoped artifact.
- Verify alpha channel/foreground.
- Replace binding path with derived artifact.
- Expose transformation status in workflow/validation metadata.

### Task 5: Strengthen deterministic composition patching

**Files:**
- Modify: `server/src/compositionPatcher.js`
- Modify: `server/src/compositionPatcher.test.js`
- Modify: `server/src/composer/agent.js`

**Steps:**

- Resolve `scene-6`/`scene6` and semantic global targets.
- Patch header logo target with a real `<img>` using the bound asset.
- Patch operator scene using the derived cutout and 3D frame structure.
- Enforce/reconstruct the 54–60 second outro target with the logo asset.
- Preserve untouched source blocks byte-for-byte.
- Fall back to the agent only for operations that cannot be deterministically expressed.

### Task 6: Persist exact prompt provenance

**Files:**
- Create: `server/src/promptProvenance.js`
- Create: `server/src/promptProvenance.test.js`
- Modify: `server/src/jobs.js`
- Modify: `server/src/composer/agent.js`
- Modify: `server/src/store.js` for historical normalization only

**Steps:**

- Define parent-prompt resolution per version.
- Build effective revision prompt once.
- Persist exactly what is written to `prompt.txt`.
- Hash snapshots without secrets.
- Prevent later runner mutations from changing prompt provenance.
- Historical jobs should show `Unavailable for this historical version`, not fabricate a prompt.

### Task 7: Add composition/output validation

**Files:**
- Create: `server/src/revisionValidation.js`
- Create: `server/src/revisionValidation.test.js`
- Modify: `server/src/jobRunner.js`
- Modify: `server/src/workflow.js`

**Steps:**

- Validate asset bindings under target subtrees.
- Validate target scene timing and requested duration.
- Validate source preservation hashes for untouched regions.
- Fail before render when required composition bindings are absent.
- Validate final media after audio mix.
- Store detailed safe evidence.

### Task 8: Fix the audio mix duration contract

**Files:**
- Modify: `server/src/jobRunner.js`
- Modify: `server/src/jobRunner.test.js`

**Steps:**

- Replace `-shortest` mix behavior.
- Pad short voiceover with silence.
- Extend/loop music as needed.
- Keep video duration authoritative.
- Add exact ffprobe assertions.
- Verify a 46.8-second narration produces a 60.0-second MP4 with silence after narration.

### Task 9: Correct the prompt UI

**Files:**
- Modify: `web/src/pages/JobDetail.jsx`
- Create: `web/src/components/PromptSnapshot.jsx`
- Modify: `web/src/api/client.js` only if a dedicated provenance endpoint is used
- Modify: `web/src/styles.css`

**Steps:**

- Rename/remove the draft copy label.
- Add read-only Parent prompt and Revised prompt disclosures.
- Add exact copy buttons and `Copied` state.
- Show unavailable state for historical prompt snapshots.
- Keep editable instruction visually separate.
- Show parent version link and revised-prompt metadata.

### Task 10: Add validation UI and truthful success state

**Files:**
- Create: `web/src/components/RevisionValidation.jsx`
- Modify: `web/src/pages/JobDetail.jsx`
- Modify: `web/src/pages/Generations.jsx`
- Modify: `web/src/styles.css`

**Steps:**

- Display duration, target, asset, preservation, and stream checks.
- Distinguish `needs attention` from validated success.
- Do not present a 50-second output as successful for a 60-second request.
- Show missing required asset by filename and requested target.

### Task 11: Repair `57f69416` through an immutable child

**Objective:** Prove the fixed system with the reported case without mutating the bad version.

**Steps:**

1. Keep `57f69416` as the evidence baseline.
2. Create one corrected child only after the implementation tests pass.
3. Reuse the approved narration and unchanged assets/stages.
4. Apply the three target operations.
5. Verify operator image appears under Scene 6.
6. Verify real logo appears in header and Scene 7.
7. Verify the outro occupies 54–60 seconds.
8. Verify final MP4 is 60.0 seconds with H.264 video and AAC audio.
9. Capture representative frames from:
   - header scene;
   - operator scene;
   - 55–59 second outro.
10. Inspect those frames visually before reporting success.

---

## Verification commands and evidence

From repository root:

```text
npm test
npm run lint
npm run build
git diff --check
```

Media checks:

```text
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name -of json <clean-video>
ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name -of json <final-output>
```

Frame checks:

```text
ffmpeg -y -ss 2 -i <output> -frames:v 1 header.jpg
ffmpeg -y -ss 47 -i <output> -frames:v 1 operator.jpg
ffmpeg -y -ss 57 -i <output> -frames:v 1 outro.jpg
```

Browser checks:

- Parent prompt is read-only and copies exactly.
- Revised prompt is read-only and copies exactly.
- Editable instruction is not mislabeled as the revised prompt.
- All three targets and both asset bindings are visible before creation.
- Validation status matches API/job metadata.
- No horizontal overflow at desktop/tablet/mobile widths.

---

## Acceptance criteria

- The exact `57f69416` instruction resolves into header-logo, operator-scene, and outro targets.
- The uploaded operator asset cannot be ignored when marked required for the operator target.
- The logo asset must appear at both requested target locations.
- Generated placeholders do not count as required logo usage.
- Final output duration is 60.0 seconds within 0.1-second tolerance.
- Outro is visible from 54–60 seconds.
- Narration ends before the outro and short audio cannot truncate the video.
- Non-target source regions remain unchanged.
- Parent prompt and revised prompt are immutable, read-only, separately copyable snapshots.
- The editable instruction is clearly labeled as a draft/input.
- Missing asset/target/duration validation prevents a normal `done` status.
- Full test/lint/build/diff gates pass.
- A corrected immutable child is verified with ffprobe and extracted-frame visual inspection.

---

## Risks and tradeoffs

1. Natural-language target resolution can be ambiguous. Block and ask for review rather than binding the wrong uploaded image.
2. Chroma keying quality depends on the green-screen source. Validate alpha output and allow a visible preprocessing failure.
3. Existing historical jobs lack exact effective prompt snapshots. Do not reconstruct and claim exactness; mark them unavailable.
4. Deterministic patching should remain conservative. A failed safe patch may fall back to the composer, but post-compose target validation is still mandatory.
5. Rendering a new final MP4 remains normal for visual changes. The correctness guarantee is that unchanged source regions remain preserved and required targets are enforced.
6. The repository already contains unrelated dirty work. Implementation must use targeted edits and audit the final diff without resetting anything.
