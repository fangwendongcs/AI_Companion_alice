# VRMRenderer MVP

This document records the first Web-side VRM renderer boundary for Alice.

## Current Conclusion

The project already has replaceable avatar manifests and two small CC0 VRM avatars:

- `public/avatars/osa_shiro/model.vrm`
- `public/avatars/osa_wambo/model.vrm`

Before this phase, those files were loaded through the existing Three.js `GLTFLoader` path and driven by the same motion fallback system as Alice. This phase adds a lightweight renderer adapter layer so VRM avatars can consume the shared `AvatarDirective` contract without changing Dialogue, Memory, Persona, Emotion, or backend orchestration code.

## Renderer Boundary

```text
/api/dialogue
  -> avatar_directive
  -> DialogueManager
  -> AppController
  -> PresentationOrchestrator
  -> CharacterManager.applyAvatarDirective()
  -> active AvatarRenderer
```

The backend remains renderer-agnostic. It returns semantic state only:

- `state`: `idle / listening / thinking / speaking`
- `emotion`: `neutral / warm / happy / sad / concerned`
- `gesture`: `none / soft_nod / thinking / wave`
- `gaze`: `user / away / down`
- `lip_sync`: `none / auto / basic`
- `intensity`: `0..1`

It does not return VRM expression presets, FBX paths, animation files, bone names, or model paths.

## Implemented Adapters

```text
js/avatar/renderers/
  AvatarRendererFactory.js
  DefaultAvatarRenderer.js
  VRMRenderer.js

js/avatar/presentation/
  PresentationOrchestrator.js
  ExpressionController.js
  LipSyncController.js
  AudioAmplitudeSampler.js
  MotionController.js
  TTSController.js
```

- `DefaultAvatarRenderer` is a no-op adapter for existing GLB / fallback avatars.
- `VRMRenderer` consumes `AvatarDirective`, collects compatible morph targets, and delegates expression / blink policy to `ExpressionController` and speaking mouth timing to `LipSyncController`.
- `AvatarRendererFactory` selects `vrm` for manifests with `renderer.type = "vrm"` or `model.format = "vrm"`.

The existing `MotionManager` and animation slot queue remain responsible for body actions. VRMRenderer only handles presentation-level expression / basic lip-sync hints.

`PresentationOrchestrator` is the Web-side coordinator between app events and presentation execution. It owns directive application, affect tone hinting, audio start / end presentation fallback, and controller coordination. Its expression / lip-sync adapters resolve the active renderer controller dynamically through `CharacterManager`, so avatar switches do not leave a stale renderer reference and the default path no longer stops at a noop controller. It does not decide persona, memory, dialogue policy, backend provider behavior, or model-specific renderer behavior.

`ExpressionController` and `LipSyncController` keep `VRMRenderer` close to the execution layer:

- `ExpressionController`: emotion / tone / blink policy and expression pattern helpers.
- `LipSyncController`: conservative U/O speaking loop when available, optional audio-amplitude mouth intensity capped at `0.22`, one-group fallback, mouth reset, and a small renderer-agnostic debug snapshot. The renderer still discovers all A/I/U/E/O capabilities, but product policy intentionally prefers subtle movement over phoneme realism or exposed teeth.
- `AudioAmplitudeSampler`: optional Web Audio sampler for playable backend audio sources. If analysis is unavailable, lip-sync falls back to the basic speaking loop.
- `MotionController`: maps semantic `AvatarDirective`, `affect.motion`, and audio lifecycle into existing `MotionManager` slots.
- `TTSController`: tracks presentation-level TTS / audio lifecycle state without owning playback or provider secrets.
- `VRMRenderer`: model morph target collection, capability reporting, and low-level morph influence writes.

`MotionManager` remains the owner of body motion resources, queueing, state, transitions, and playback. `MotionController` only decides which semantic slot to request; it never references animation files, skeleton names, model paths, or FBX / VRM internals.

`AudioManager` and `TTSService` remain the owners of audio playback, browser fallback, and backend `/api/tts` provider behavior. `TTSController` only gives the presentation layer one stable lifecycle state for request / playing / fallback / end / error so lip-sync and motion can respond from a single place.

For backend audio playback, `TTSService` passes a local `HTMLAudioElement` as a non-secret `audioSource` through `AudioManager -> AppController -> PresentationOrchestrator -> active VRMRenderer LipSyncController`. `LipSyncController` uses it only for amplitude sampling. Browser `speechSynthesis` does not expose a safe audio stream, so browser fallback remains on the basic speaking loop. This phase does not add Higgs Audio, OpenAI TTS, Azure, ElevenLabs, phoneme / viseme metadata, or a new provider.

Long playback lifecycle rules:

- `audio:start` cancels the pre-playback text-duration watchdog, so real audio duration owns the speaking lifetime.
- A newer TTS request invalidates older playback callbacks; stale `audio:start` / `audio:end` events cannot reset the new renderer state.
- Cancelling an `HTMLAudioElement` settles its playback Promise and clears playback references, avoiding unresolved long-audio tasks and delayed cleanup.
- `audio:end` / `audio:error` clear amplitude sampling, zero mouth influences, and request idle recovery through the same presentation boundary.
- Common `warm` / `curious` affect uses a light neutral face instead of stacking a happy smile over lip-sync. Explicit `happy` keeps its semantic tone / blink / motion behavior but also uses a light neutral face; it does not activate the model's joy/fun mouth morphs, which can expose teeth.
- A directive with `intensity=0` remains zero instead of falling back to the default expression intensity, so idle cleanup can fully clear the previous expression.

`AppController` syncs the lip-sync debug snapshot into `state.presentation.lipSync` only while lip-sync is active or when audio lifecycle changes. The Debug Panel reads that state to show mode, amplitude, fallback status, and current mouth group without storing audio objects, morph target names, provider keys, or renderer-specific paths.

## Avatar Manifest Fields

VRM avatars should declare:

```json
{
  "model": {
    "url": "public/avatars/avatar_id/model.vrm",
    "format": "vrm"
  },
  "renderer": {
    "type": "vrm",
    "fallback": "default"
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

## Test Model Rules

Local test models can be placed in:

```text
assets/avatars/test-vrm/
```

The local-only manifests are:

```text
assets/avatars/test-vrm/manifest.json
assets/avatars/test-vrm/manifest.boy.json
assets/avatars/test-vrm/manifest.girl.json
```

They are injected into the Web avatar list only when `?debug=1` or `?localVrm=1` is present and the referenced model file exists. The local test avatar IDs remain outside the public registry. Since 2026-07-14, the official `alice` manifest intentionally points to the same `assets/avatars/test-vrm/girl.vrm` file so both the normal Demo and debug page default to the previously validated Girl VRM while retaining the stable `alice` identity.

Use these URLs for local visual validation:

```text
http://localhost:3000?debug=1&avatar=local_alice_vrm_test
http://localhost:3000?debug=1&avatar=local_boy_vrm_test
http://localhost:3000?debug=1&avatar=local_girl_vrm_test
```

The local manifests can provide `renderer.expressionMap` so different morph target naming conventions are handled in configuration instead of inside `VRMRenderer`.

`.vrm`, `.glb`, `.gltf`, and the extensionless `alice_test` local file are ignored by Git. Promote a model into `public/avatars/{avatarId}/` only after checking:

- License is explicit and compatible with a public repository.
- VRM version and humanoid rig are known.
- Expressions include usable neutral / happy / sad / blink fallbacks.
- LookAt and springBone behavior do not break Web rendering.
- Texture size and polygon count are acceptable for browser performance.
- The model loads through an avatar manifest and does not require backend changes.

## Local Model Audit

`npm run check:vrm-renderer-flow` audits any local test VRM files that exist on the machine:

- file existence and size;
- GLB magic header and version;
- mesh, primitive, and skinned mesh counts;
- morph target names and likely mouth / blink / emotion candidates;
- humanoid bone naming clues;
- material, texture, image, and mime type counts.

Missing local test files do not fail the check because these assets are intentionally ignored by Git. If a file is present, invalid GLB / VRM container data fails the check.

## Girl VRM Expression Sample

`local_girl_vrm_test` is the source MVP sample for Web VRM expression and state linkage. The normal `alice` manifest now reuses the same model-specific expression map and five-vowel mouth groups so DeepSeek affect, CosyVoice playback and lip-sync drive the exact same Girl VRM:

- `idle / listening`: neutral expression with automatic blink.
- `speaking`: lightweight rhythmic mouth movement across `Fcl_MTH_U / O` when available; other mouth groups remain capability metadata.
- `happy`: mapped to a light neutral face; playful voice, blink and body motion carry the happy semantic without activating toothy joy/fun morphs.
- `warm / curious`: mapped to a light neutral expression so normal companion speech does not stack a toothy smile over lip-sync.
- `sad`: mapped to sorrow expressions.
- `angry`: mapped to angry expressions.
- `surprised`: mapped to surprised expressions.
- `concerned / apologetic`: low-intensity fallback to sorrow.
- `thinking` uses its independent motion slot; a missing file remains a safe procedural fallback or no-op according to the motion manifest.

Tone remains a presentation hint. `VRMRenderer` can use it to scale expression / mouth intensity, but tone does not make business decisions and is not written back into Dialogue, Memory, Persona, or backend orchestration.

## Fallback Strategy

- If the default `girl.vrm` file is missing or invalid, Alice reports a model loading error and uses the existing explicit fallback mesh only when there is no previous working avatar; it must not silently return to `avatar_v2.glb` or another FBX/GLB model.
- If a VRM has no matching morph targets, `VRMRenderer` becomes a safe no-op for expressions while the regular motion slot system still works.
- If a VRM has no five-vowel mouth groups, `VRMRenderer` falls back to a generic `mouth` group when available.
- If a VRM model fails to load, existing avatar switch error handling retains the previous working avatar or uses the existing fallback mesh.
- The backend never changes behavior based on VRM availability.

## Validation

Automated coverage:

```bash
npm run check:vrm-renderer-flow
```

This verifies:

- VRM manifests declare renderer and capabilities.
- local VRM test avatar IDs remain renderer-gated and outside the public registry;
- the official default `alice` manifest resolves to `assets/avatars/test-vrm/girl.vrm`, declares `renderer.type=vrm`, and retains all expression / mouth mappings;
- `CharacterManager` owns the active renderer adapter.
- `AppController` forwards `AvatarDirective`.
- `VRMRenderer` can apply expression and basic mouth movement on a fake morph-target avatar.
- `VRMRenderer` can drive conservative happy-as-neutral plus sad / angry / surprised expression groups, U/O speaking mouth movement, and automatic blink while retaining five-vowel capability discovery.
- `ExpressionController` and `LipSyncController` are covered directly so expression / blink / lip-sync policy does not drift back into `VRMRenderer`.
- `LipSyncController` is covered for optional audio-amplitude mouth intensity and for fallback when no audio source is available.
- `PresentationOrchestrator` is covered for object-identity delivery of `audioSource` to the active renderer-owned `LipSyncController`, rather than a static source-code string check.
- A simulated 120-second amplitude stream verifies that mouth values stay finite and active, then return to idle with all tested mouth influences reset.
- TTS playback replacement is covered so stale long-audio callbacks are ignored and cancelled `HTMLAudioElement` playback settles cleanly.
- `MotionController` is covered directly so gesture / affect / audio lifecycle motion mapping does not drift back into `PresentationOrchestrator` or `VRMRenderer`.
- `TTSController` is covered directly so audio lifecycle state does not drift back into `AppController`, `AudioManager`, or `VRMRenderer`.
- Backend business services do not depend on renderer-specific fields.
- Local VRM binaries remain ignored until licensing and distribution are resolved.
- `alice_test.vrm`, `boy.vrm`, and `girl.vrm` can be audited locally; `girl.vrm` is also the current machine's official Alice model dependency.

## Current Visual Validation Status

The default Alice model passed a real 99.48-second CosyVoice2 browser run with the conservative U/O profile and natural end cleanup. Shiro and Wambo are existing small CC0 VRM assets, but this phase does not claim the same visual QA pass for them. Use `http://localhost:3000?debug=1`, switch to Shiro / Wambo, send a stub dialogue, and confirm:

- model remains visible;
- dialogue state reaches speaking then idle;
- Debug Panel shows `lipSync.mode=audio-driven` for backend audio, changing amplitude / mouth values during playback, then `idle` after audio ends;
- click interactions still trigger motion slots;
- console has no new errors or warnings.

2026-07-14 real-browser status: `local_girl_vrm_test` passed short CosyVoice2 playback (`6.64s`), long playback (`37.12s`), rapid replacement, mute/cancel, and upstream interruption/recovery. The long run captured 359 audio-driven samples, amplitude `0–0.308`, mouth amount `0.03–0.11`, all five vowel groups, neutral/blink expressions, and speaking body motion; natural end returned lip-sync, all mouth expressions, Avatar state, and motion to idle. Browser QA exposed and closed two lifecycle defects: TTS now has a 90-second backend upstream timeout with a 100-second Web request window, and cancelling an active playback emits `audio:end(cancelled=true)` before a replacement or mute path proceeds. Lip-sync gain, smoothing, clamp, and mouth interval remain unchanged because no clear visual defect was observed. See `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md` for the scenario matrix and evidence limits.

2026-07-14 default-model correction: normal `/` and `/?debug=1` both performed an actual HTTP 200 `GET /assets/avatars/test-vrm/girl.vrm` and initialized `VRMRenderer` with VRM runtime, humanoid, expression manager, lookAt, spring bone and A/I/U/E/O mouth groups. Refresh retained the model with `localStorage.avatar_id=alice`. Two Web dialogue rounds returned real DeepSeek `llm_only` replies and CosyVoice playback with `fallback=false`; an active playback capture on the same `alice` renderer observed `audio-driven` mouth changes across E/A/U/O/I before returning to idle. No VRM load error appeared in Console.

2026-07-23 conservative-mouth status: user-facing visual feedback identified exposed teeth / uncanny-valley risk in the five-vowel profile. The active speaking policy now uses only U/O when available, caps mouth influence at `0.22`, closes around silence, and avoids adding happy/relaxed for common warm/curious affect. A real 455-character CosyVoice2 run produced 36 segments and 99.48 seconds of audio; sampled mouth values stayed on U/O with a maximum observed amount of `0.10`, then returned to zero/idle. Two following short turns also ended cleanly. The same run recorded 17 underruns and a maximum `6.088s` segment gap; that latency issue belongs to P5 and does not reopen P2 wiring.

2026-07-24 no-teeth closure: a 10-turn real DeepSeek + CosyVoice2 browser run kept all speaking mouth samples on U/O, recorded `happy` morph maximum `0`, and returned to `idle / mouth=0` after every turn. The first pass exposed a residual closed-eye smile after audio and a distress sentence incorrectly classified as happy. `ExpressionController` now preserves explicit zero intensity and never writes the happy group; `EmotionPolicy` prioritizes user distress before positive punctuation or memory context. See `docs/reports/DEMO_EXPERIENCE_ACCEPTANCE_20260724.md`.
