# Local VRM Test Assets

Use this folder for local-only VRM validation before a model is promoted into `public/avatars/{avatarId}/`.

Do not commit `.vrm`, `.glb`, or `.gltf` files here unless the license is clear and the project intentionally promotes the model into the runtime avatar registry.

## Local Test Manifests

This folder contains committed local-only manifests:

```text
assets/avatars/test-vrm/manifest.json
assets/avatars/test-vrm/manifest.boy.json
assets/avatars/test-vrm/manifest.girl.json
```

They are not part of `public/avatars/registry.json`. The Web app only appends them to the avatar list when opened with `?debug=1` or `?localVrm=1`.

Direct test URLs:

```text
http://localhost:3000?debug=1&avatar=local_alice_vrm_test
http://localhost:3000?debug=1&avatar=local_boy_vrm_test
http://localhost:3000?debug=1&avatar=local_girl_vrm_test
```

or use the local VRM flag explicitly:

```text
http://localhost:3000?localVrm=1&avatar=local_alice_vrm_test
http://localhost:3000?localVrm=1&avatar=local_boy_vrm_test
http://localhost:3000?localVrm=1&avatar=local_girl_vrm_test
```

Expected local model paths:

```text
assets/avatars/test-vrm/alice_test.vrm
assets/avatars/test-vrm/boy.vrm
assets/avatars/test-vrm/girl.vrm
```

If your downloaded file has no extension but is a GLB / VRM container, keep it local and create an ignored symlink:

```bash
ln -sf alice_test assets/avatars/test-vrm/alice_test.vrm
```

Recommended checklist before promotion:

- License is explicit and compatible with public repository usage.
- VRM version and humanoid rig are known.
- Expressions include at least neutral / happy / sad / blink or acceptable fallbacks.
- Texture size and polygon count are suitable for Web rendering.
- The model loads through `public/avatars/{avatarId}/manifest.json`.

Run the local model audit before promotion:

```bash
npm run check:vrm-renderer-flow
```

The audit prints file size, GLB header, mesh / skinned mesh counts, morph target candidates, humanoid bone clues, and material / texture counts for the local test files that exist on this machine.

## Girl VRM MVP Mapping

`manifest.girl.json` is the current Web-side VRM expression mapping sample. It keeps model-specific morph target names in manifest configuration:

- `happy`: `Fcl_ALL_Joy`, `Fcl_ALL_Fun`, mouth / eye joy variants
- `sad`: `Fcl_ALL_Sorrow`, mouth / eye sorrow variants
- `angry`: `Fcl_ALL_Angry`, mouth / eye angry variants
- `surprised`: `Fcl_ALL_Surprised`, mouth / eye surprised variants
- `blink`: `Fcl_EYE_Close`, `Fcl_EYE_Close_R`, `Fcl_EYE_Close_L`
- speaking mouth cycle: `Fcl_MTH_A / I / U / E / O`

The mapping is intentionally local-only and renderer-facing. Dialogue, Memory, Persona, Emotion, and backend contract code should continue to emit semantic `AvatarDirective` fields rather than VRM morph target names.
