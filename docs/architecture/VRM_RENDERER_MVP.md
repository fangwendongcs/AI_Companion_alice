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
```

- `DefaultAvatarRenderer` is a no-op adapter for existing GLB / fallback avatars.
- `VRMRenderer` consumes `AvatarDirective` and applies a conservative morph-target mapping when compatible expression names exist.
- `AvatarRendererFactory` selects `vrm` for manifests with `renderer.type = "vrm"` or `model.format = "vrm"`.

The existing `MotionManager` and animation slot queue remain responsible for body actions. VRMRenderer only handles presentation-level expression / basic lip-sync hints.

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

`.vrm`, `.glb`, and `.gltf` files in that folder are ignored by Git. Promote a model into `public/avatars/{avatarId}/` only after checking:

- License is explicit and compatible with a public repository.
- VRM version and humanoid rig are known.
- Expressions include usable neutral / happy / sad / blink fallbacks.
- LookAt and springBone behavior do not break Web rendering.
- Texture size and polygon count are acceptable for browser performance.
- The model loads through an avatar manifest and does not require backend changes.

## Fallback Strategy

- If no `.vrm` test file exists, the app continues to use Alice / current avatars.
- If a VRM has no matching morph targets, `VRMRenderer` becomes a safe no-op for expressions while the regular motion slot system still works.
- If a VRM model fails to load, existing avatar switch error handling retains the previous working avatar or uses the existing fallback mesh.
- The backend never changes behavior based on VRM availability.

## Validation

Automated coverage:

```bash
npm run check:vrm-renderer-flow
```

This verifies:

- VRM manifests declare renderer and capabilities.
- `CharacterManager` owns the active renderer adapter.
- `AppController` forwards `AvatarDirective`.
- `VRMRenderer` can apply expression and basic mouth movement on a fake morph-target avatar.
- Backend business services do not depend on renderer-specific fields.
- Local test VRM assets are ignored unless explicitly promoted.

## Current Visual Validation Status

Shiro and Wambo are existing small CC0 VRM assets, but this phase does not claim a full visual QA pass unless the browser checklist is run manually. Use `http://localhost:3000?debug=1`, switch to Shiro / Wambo, send a stub dialogue, and confirm:

- model remains visible;
- dialogue state reaches speaking then idle;
- click interactions still trigger motion slots;
- console has no new errors or warnings.
