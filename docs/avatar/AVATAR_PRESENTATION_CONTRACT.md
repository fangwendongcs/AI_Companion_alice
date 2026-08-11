# Avatar Presentation Contract

This document defines the Web avatar presentation boundary for Alice. The goal is to keep future expression, lip-sync, TTS, motion, and renderer work out of `DialogueManager`, `AppController`, `CharacterManager`, and model-specific renderer files.

## Current Audit Result

Status: MVP wiring complete; the default Alice has passed real CosyVoice2 browser lifecycle QA. Other avatars remain external-runtime and model-specific visual QA work.

- `/api/dialogue` already returns renderer-agnostic semantic fields such as `companion_state`, `emotion`, `tone`, and `avatar_directive`.
- `DialogueManager` only forwards dialogue response metadata and does not make renderer decisions.
- `AudioManager` only applies non-secret `affect.voice` hints such as rate and pitch before delegating to TTS.
- `MotionManager` remains the unified motion slot entry and does not require UI code to know animation filenames.
- `CharacterManager` owns the active avatar renderer and delegates `AvatarDirective` through `applyAvatarDirective()`.
- `DefaultAvatarRenderer` is a safe no-op renderer; `VRMRenderer` is the first active renderer adapter for expression, blink, and basic lip-sync.
- `PresentationOrchestrator` now owns the first layer of Web presentation routing: dialogue directive application, affect tone hints, audio start / end presentation state, and speaking / idle directive fallback.
- Its default expression / lip-sync controllers dynamically resolve the active renderer-owned controller through `CharacterManager`; they are no longer permanent noop placeholders.
- `AppController` still listens to app events and updates UI/debug state, but it no longer owns the direct AvatarDirective-to-renderer and affect-to-motion mapping logic.
- `ExpressionController` now owns emotion-to-expression mapping, tone intensity policy, and blink timing.
- `LipSyncController` now owns speaking mouth loop timing, optional audio-amplitude mouth intensity, mouth group cycling, and mouth reset.
- `MotionController` now owns semantic motion intent mapping from `AvatarDirective`, `affect.motion`, and audio lifecycle events into the existing `MotionManager` slots.
- `TTSController` now owns the presentation-level TTS / audio lifecycle state: request, playing, fallback, end, and error.
- `VRMRenderer` now stays closer to execution: it collects morph targets, reports capabilities, delegates expression / lip-sync decisions, and writes morph influence values.
- Backend `HTMLAudioElement` sources now reach the active VRM `LipSyncController`; renderer switches resolve controllers dynamically rather than retaining a constructor-time renderer reference.

## Current Web Presentation Flow

```text
/api/dialogue
  -> DialogueManager
  -> DIALOGUE_ASSISTANT { text, memory, affect, avatarDirective, meta }
  -> AppController
     -> patch UI/debug state
     -> AudioManager.speak()
     -> PresentationOrchestrator
        -> CharacterManager.applyAvatarDirective({ applyPresentation: false })
        -> active renderer ExpressionController / LipSyncController
        -> MotionManager.requestSlot()
  -> CharacterManager
     -> active AvatarRenderer.applyDirective()
     -> active AvatarRenderer.update(delta)
```

Runtime loop:

```text
SceneRuntime.render(delta)
  -> MotionManager.update(delta)
  -> CharacterManager.updateAvatarRenderer(delta)
```

This means body motion and renderer-level expression are separated at runtime, while `PresentationOrchestrator` is the single Web coordinator that distributes semantic state to expression, motion, lip-sync, and audio lifecycle controllers.

## Contract Principles

1. Backend business services output semantic state only.
2. Dialogue / Memory / Persona / Emotion do not depend on FBX, VRM, Rive, skeleton names, animation files, or model paths.
3. Web and future iOS clients consume the same `/api/dialogue` semantic contract.
4. Renderers execute presentation instructions; they do not decide persona, memory, emotion policy, or dialogue behavior.
5. Missing renderer capability must be a safe no-op.
6. Model-specific morph target names, expression aliases, and motion compatibility belong in manifest / capability mapping, not in business services.
7. TTS provider secrets and backend provider decisions never enter presentation-layer code.

## Semantic Input

The presentation layer consumes these values:

```json
{
  "companion_state": "speaking",
  "emotion": {
    "name": "warm",
    "intensity": 0.7
  },
  "tone": "gentle",
  "avatar_directive": {
    "state": "speaking",
    "emotion": "warm",
    "gesture": "soft_nod",
    "gaze": "user",
    "lip_sync": "auto",
    "intensity": 0.7
  },
  "affect": {
    "voice": {
      "style": "gentle",
      "rate": 1,
      "pitch": 1
    },
    "motion": {
      "slot": "speaking",
      "intensity": 0.6
    }
  }
}
```

Forbidden presentation contract fields:

- `animationFile`
- `fbxPath`
- `vrmExpressionPreset`
- `boneName`
- `hardcoded animation path`
- `provider secret`
- `n8n webhook`

## Recommended Module Boundary

The following modules are the target shape. They should be introduced incrementally and only when the existing MVP behavior is preserved.

```text
js/avatar/presentation/
  PresentationOrchestrator.js   # implemented minimal skeleton
  ExpressionController.js       # implemented for emotion / tone / blink policy
  LipSyncController.js          # implemented for basic speaking mouth loop and optional audio amplitude
  AudioAmplitudeSampler.js      # implemented for optional Web Audio amplitude sampling
  MotionController.js           # implemented for semantic motion intent mapping
  TTSController.js              # implemented for presentation-level audio lifecycle state
  presentationTypes.js
```

### PresentationOrchestrator

Responsibilities:

- Consume `AvatarDirective`, `affect`, audio lifecycle events, and high-level companion state.
- Coordinate expression, lip-sync, motion, and audio presentation.
- Own presentation state such as current directive, last affect, speaking activity, and current renderer capability snapshot.
- Keep `AppController` thin by replacing direct presentation glue such as `requestAffectMotion()` and `applyAvatarDirective()` orchestration.

Non-responsibilities:

- Persona decisions.
- Memory writes or reads.
- Prompt building.
- LLM provider selection.
- Renderer-specific morph target names.

### ExpressionController

Responsibilities:

- Convert semantic emotion and tone into renderer expression instructions.
- Handle neutral / happy / sad / angry / surprised / concerned / apologetic fallback.
- Preserve explicit `intensity=0` for full cleanup; do not replace it with the default intensity.
- Render `happy` with a light neutral face while voice, blink and body motion carry the playful semantic, avoiding joy/fun mouth morphs that can expose teeth.
- Drive blink policy when the active renderer supports it.
- Use `manifest.renderer.expressionMap` and capabilities to avoid model-specific hardcoding.
- Provide expression pattern matching helpers used by `VRMRenderer` during morph target collection.

Safe no-op:

- If the renderer has no matching expression, keep the avatar visible and do nothing.

### LipSyncController

Responsibilities:

- Convert `state=speaking` and `lip_sync=auto/basic` into mouth movement instructions.
- Start and stop mouth movement from audio lifecycle.
- Support browser TTS fallback without requiring phoneme analysis.
- Consume optional audio amplitude from playable audio sources and fall back to the basic speaking loop when analysis is unavailable.
- Discover A / I / U / E / O mouth capabilities, but use a conservative U / O speaking profile when available; fall back to one generic mouth group instead of pursuing phoneme-realistic movement.
- Keep audio-driven mouth influence at or below `0.22`, close the mouth around silence, and avoid large A / I shapes that can expose teeth.
- Expose a small debug snapshot for `mode`, `audioDriven`, `fallback`, amplitude, mouth group, and mouth amount so the Debug Panel can show whether lip-sync is running.

Safe no-op:

- If no mouth morph exists, keep TTS and motion working without mouth animation.

### MotionController

Responsibilities:

- Map semantic states and gestures into existing `MotionManager` slots.
- Map `affect.motion.slot` into the nearest supported body motion slot.
- Handle audio lifecycle motion requests such as `audio:start -> speaking` and `audio:end -> idle`.
- Keep body motion queue, priority, fade, and idle recovery in `MotionManager`.
- Avoid direct animation file references in UI or renderer code.

Example mapping:

```text
thinking -> thinking
speaking -> speaking
soft_nod -> chat
wave -> wave
idle -> idle
```

Safe no-op:

- If a target slot is unavailable, fall back to `speaking` or `idle`.
- If `MotionManager` is not ready, return a stable no-op result instead of blocking dialogue, TTS, or renderer updates.

### TTSController

Responsibilities:

- Bridge presentation needs to `AudioManager` / `TTSService`.
- Track TTS lifecycle states: request, playing, fallback, end, and error.
- Apply non-secret voice hints such as rate, pitch, and style.
- Emit or relay audio lifecycle state for lip-sync and motion.
- Preserve browser fallback behavior.

Non-responsibilities:

- TTS provider secret handling.
- Backend provider configuration.
- Prompt or reply generation.
- Actual audio playback, which stays in `AudioManager` / `TTSService`.

Current rule:

- The first implementation is lifecycle-only. It does not connect Higgs Audio, OpenAI TTS, Azure, ElevenLabs, or any new provider.
- Real provider work should happen behind `TTSService` / backend `/api/tts` and continue to send only non-secret style hints to the frontend.
- Local CosyVoice2, remote Qwen3-TTS/Fish Audio, and the generic `self_hosted` adapter all enter this same lifecycle through the unified Audio Result; Presentation must never branch on provider id.
- When backend audio playback exposes an `HTMLAudioElement`, the presentation layer may use a local amplitude sampler for lip-sync. Browser `speechSynthesis` does not expose a safe audio element, so it remains on the fallback speaking loop.

### Renderer Boundary

Renderers remain execution adapters:

- `DefaultAvatarRenderer`: safe no-op and capability reporting.
- `VRMRenderer`: morph target expression, basic lip-sync, blink, and future VRM-specific execution.
- Future renderer adapters: FBX / Rive / native WebGL / iOS should consume the same semantic directive.

Renderers should not:

- Call `/api/dialogue`.
- Read or write memory.
- Choose persona.
- Decide whether a response is apologetic, warm, or concerned.
- Know provider keys, workflow URLs, or RAG details.

## Manifest And Capabilities

Each avatar manifest should remain the source of renderer capability truth:

```json
{
  "renderer": {
    "type": "vrm",
    "fallback": "default",
    "expressionMap": {
      "happy": ["fcl_all_joy", "smile"],
      "sad": ["fcl_all_sorrow"],
      "mouthA": ["fcl_mth_a"]
    }
  },
  "capabilities": {
    "states": ["idle", "listening", "thinking", "speaking"],
    "emotions": ["neutral", "warm", "happy", "sad", "concerned"],
    "gestures": ["none", "soft_nod", "thinking", "wave"],
    "gaze": ["user", "away", "down"],
    "lipSync": ["none", "auto", "basic"],
    "expressions": ["neutral", "happy", "sad", "blink"],
    "renderer": "vrm"
  }
}
```

Rules:

- Capabilities describe what a renderer can express.
- Expression maps adapt model-specific morph names to semantic groups.
- Motion compatibility stays in motion manifests / `MotionManager`.
- Backend should never read these manifests to make business decisions.

## Short-Term Development Plan

### Presentation-1: Contract And Documentation

Done. Freeze the module boundary and keep existing behavior unchanged.

Acceptance:

- Documentation explains where expression, lip-sync, TTS, motion, and renderer responsibilities belong.
- No business code changes are required.

### Presentation-2: Extract PresentationOrchestrator

Done for the MVP. The minimal `PresentationOrchestrator` owns directive application, affect tone hints, audio start / end presentation fallback, and controller coordination.

Candidate moves:

- `withAffectDirectiveHints()` moved.
- `applyAvatarDirective()` moved.
- `requestAffectMotion()` moved behind the presentation boundary and now delegates to `MotionController`.
- speaking reset directive construction moved.
- audio start / end presentation coordination partially moved.

Acceptance:

- `AppController` still owns app flow and UI state, but no longer directly maps semantic gestures to motion slots.
- Existing Alice / Shiro / Wambo / local girl VRM flows still pass.
- Future work should move more audio lifecycle glue from `AppController` only after browser visual validation remains stable.

### Presentation-3: Extract ExpressionController And LipSyncController

Done for the MVP. Renderer expression and mouth timing policy moved out of `VRMRenderer` into reusable presentation helpers.

Acceptance:

- `VRMRenderer` becomes an execution adapter for morph influence writes.
- Girl VRM expression, blink, and speaking mouth movement still work.
- Missing morph targets remain safe no-op.
- `check:vrm-renderer-flow` verifies the controller boundary and prevents expression / blink / lip-sync policy from drifting back into `VRMRenderer`.

### Presentation-4A: Extract MotionController

Done for the MVP. Semantic motion mapping moved out of `PresentationOrchestrator` into `MotionController`.

Acceptance:

- `PresentationOrchestrator` coordinates motion through a controller instead of owning gesture / affect mapping tables.
- `MotionController` maps `idle / listening / thinking / speaking / gesture / affect.motion` into existing `MotionManager` slots.
- `MotionManager` remains the owner of motion resources, queueing, state, and playback.
- Missing `MotionManager` or unsupported motion slots must be safe no-op.
- `check:vrm-renderer-flow`, `check:companion-state-flow`, and `check:dialogue-contract` cover this boundary.

### Presentation-4B: Extract TTSController

Done for the MVP. TTS lifecycle state moved behind `TTSController` while `AudioManager` and `TTSService` continue to own playback and provider behavior.

Acceptance:

- `PresentationOrchestrator` coordinates TTS lifecycle through `TTSController`.
- `AudioManager` keeps playback and fallback behavior.
- `TTSService` keeps provider calls and backend endpoint logic.
- Lip-sync can later consume audio lifecycle from one place.
- `audio:request / start / fallback / end / error` all have a stable presentation-layer path.
- `audio:error` stops lip-sync and restores an idle directive through the same presentation boundary.

### Presentation-5A: Audio-Driven Lip-Sync Minimal Validation

Done for the MVP. Lip-sync can now consume optional audio amplitude from backend audio playback. If no analysable audio source exists, the old speaking loop remains the fallback.

Acceptance:

- `AudioManager` / `TTSService` can pass a safe non-secret `audioSource` for backend audio playback.
- `PresentationOrchestrator` resolves the current renderer-owned controller dynamically and passes the exact `audioSource` object into it.
- `LipSyncController` samples amplitude through `AudioAmplitudeSampler` and smooths mouth intensity to avoid high-frequency jitter.
- Browser fallback speech keeps using the fixed speaking loop because it does not expose an analysable audio element.
- `audio:end` and `audio:error` stop sampling, reset mouth influence, and return to idle/listening through the existing presentation path.
- Turning mute on during active playback calls the existing `AudioManager.stop({ emitEnd: true })`; the resulting cancelled `audio:end` must use the same mouth reset and idle path. While already muted, no new `audio:request` is emitted.
- A single backend TTS request is also represented by the existing cancellable playback session before audio arrives, so muting during remote synthesis aborts the request and emits the same cancelled `audio:end` without a late start or fallback.
- `check:vrm-renderer-flow` verifies audio-driven intensity and fallback behavior.
- Automated checks simulate 120 seconds of amplitude updates and verify active mouth values remain finite, then reset to idle / zero at end.
- `TTSService` invalidates stale playback sessions and settles cancelled audio playback so an interrupted long response cannot emit a delayed end event into the next response.
- The text-length timer is only a pre-start watchdog; real `audio:start` cancels it so it cannot truncate long CosyVoice2 playback.

### Presentation-5B: Lip-Sync Debug Observability

Done for the MVP. Lip-sync now exposes a low-noise debug snapshot through `LipSyncController -> PresentationOrchestrator -> AppController -> DebugPanelController`.

Acceptance:

- Debug Panel can show `lipSync.mode`, `lipSync.audioDriven`, `lipSync.fallback`, `lipSync.amplitude`, and the active mouth group / amount.
- `AppController` syncs presentation debug state at a throttled interval while lip-sync is active, and forces one sync at audio start/end/error.
- `LipSyncController` reports `audio-driven` when amplitude sampling is available, `loop` when it falls back to the basic speaking loop, `no-mouth` when a renderer has no mouth morphs, and `idle` after cleanup.
- `check:vrm-renderer-flow` and `check:companion-state-flow` cover the debug snapshot and Debug Panel fields.
- No audio body, provider key, or model-specific morph name is stored in global app state.

2026-07-24 default-Alice evidence: 10 real DeepSeek + CosyVoice2 browser turns all produced audio-driven U/O mouth samples, never activated the happy morph, and ended with idle lip-sync and zero mouth influence. A controlled provider fallback followed the same cleanup path. The full evidence table is in `docs/reports/DEMO_EXPERIENCE_ACCEPTANCE_20260724.md`.

### Presentation-6: Phoneme / Viseme And Real TTS Evaluation

Evaluate whether real TTS timing, phoneme / viseme metadata, or provider-specific marks are worth introducing after the amplitude MVP is stable.

Acceptance:

- No new dependency unless the MVP proves GLTFLoader-only behavior is insufficient.
- `@pixiv/three-vrm` remains a later decision for standard LookAt, SpringBone, and VRM expression APIs.

## Current Risks

- `AppController` still owns event binding, UI/debug state, and the pre-start speech watchdog. More expression / motion / audio policy should go through `PresentationOrchestrator`, not new direct methods.
- `VRMRenderer` no longer owns emotion, blink, or speaking mouth timing policy, but it still owns morph target discovery and low-level influence writes. Future runtime-specific APIs should stay behind renderer adapters.
- Existing body motion and renderer expression can run in parallel. `MotionController` now owns semantic slot mapping, but future work should define conflict rules for gestures that imply both motion and expression.
- Visual verification still needs browser checks for each model because GLTF / VRM orientation, scale, and morph naming vary by asset.
- Real CosyVoice2 amplitude distribution, perceived mouth timing, and long-audio action/expression quality cannot be proven by the simulated amplitude test alone.

## Non-Goals

- No backend renderer-specific fields.
- No iOS implementation.
- No full VRM runtime migration in this phase.
- No advanced face capture.
- No new animation system rewrite.
- No model asset promotion without license and performance review.
