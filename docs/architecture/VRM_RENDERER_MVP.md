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
  MotionController.js
```

- `DefaultAvatarRenderer` is a no-op adapter for existing GLB / fallback avatars.
- `VRMRenderer` consumes `AvatarDirective`, collects compatible morph targets, and delegates expression / blink policy to `ExpressionController` and speaking mouth timing to `LipSyncController`.
- `AvatarRendererFactory` selects `vrm` for manifests with `renderer.type = "vrm"` or `model.format = "vrm"`.

The existing `MotionManager` and animation slot queue remain responsible for body actions. VRMRenderer only handles presentation-level expression / basic lip-sync hints.

`PresentationOrchestrator` is the Web-side coordinator between app events and presentation execution. It owns the first layer of directive application, affect tone hinting, audio start / end presentation fallback, and controller coordination. It does not decide persona, memory, dialogue policy, backend provider behavior, or model-specific renderer behavior.

`ExpressionController` and `LipSyncController` keep `VRMRenderer` close to the execution layer:

- `ExpressionController`: emotion / tone / blink policy and expression pattern helpers.
- `LipSyncController`: basic speaking mouth loop, A/I/U/E/O cycling, generic mouth fallback, and mouth reset.
- `MotionController`: maps semantic `AvatarDirective`, `affect.motion`, and audio lifecycle into existing `MotionManager` slots.
- `VRMRenderer`: model morph target collection, capability reporting, and low-level morph influence writes.

`MotionManager` remains the owner of body motion resources, queueing, state, transitions, and playback. `MotionController` only decides which semantic slot to request; it never references animation files, skeleton names, model paths, or FBX / VRM internals.

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

They are injected into the Web avatar list only when `?debug=1` or `?localVrm=1` is present and the referenced model file exists. The default registry and public avatar list remain unchanged.

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

`local_girl_vrm_test` is the current MVP sample for Web VRM expression and state linkage. Its model-specific morph target names stay in `assets/avatars/test-vrm/manifest.girl.json`:

- `idle / listening`: neutral expression with automatic blink.
- `speaking`: lightweight rhythmic mouth movement across `Fcl_MTH_A / I / U / E / O`.
- `happy / warm / curious`: mapped to joy / fun expressions.
- `sad`: mapped to sorrow expressions.
- `angry`: mapped to angry expressions.
- `surprised`: mapped to surprised expressions.
- `concerned / apologetic`: low-intensity fallback to sorrow.
- missing states such as `thinking` remain safe no-op or use the existing motion slot system.

Tone remains a presentation hint. `VRMRenderer` can use it to scale expression / mouth intensity, but tone does not make business decisions and is not written back into Dialogue, Memory, Persona, or backend orchestration.

## Fallback Strategy

- If no `.vrm` test file exists, the app continues to use Alice / current avatars.
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
- the local VRM test manifest is renderer-gated and not in the public registry;
- `CharacterManager` owns the active renderer adapter.
- `AppController` forwards `AvatarDirective`.
- `VRMRenderer` can apply expression and basic mouth movement on a fake morph-target avatar.
- `VRMRenderer` can drive girl-style happy / sad / angry / surprised expression groups, five-vowel speaking mouth movement, and automatic blink.
- `ExpressionController` and `LipSyncController` are covered directly so expression / blink / lip-sync policy does not drift back into `VRMRenderer`.
- `MotionController` is covered directly so gesture / affect / audio lifecycle motion mapping does not drift back into `PresentationOrchestrator` or `VRMRenderer`.
- Backend business services do not depend on renderer-specific fields.
- Local test VRM assets are ignored unless explicitly promoted.
- `alice_test.vrm`, `boy.vrm`, and `girl.vrm` can be audited locally without entering the official registry.

## Current Visual Validation Status

Shiro and Wambo are existing small CC0 VRM assets, but this phase does not claim a full visual QA pass unless the browser checklist is run manually. Use `http://localhost:3000?debug=1`, switch to Shiro / Wambo, send a stub dialogue, and confirm:

- model remains visible;
- dialogue state reaches speaking then idle;
- click interactions still trigger motion slots;
- console has no new errors or warnings.
