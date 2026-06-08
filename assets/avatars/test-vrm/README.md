# Local VRM Test Assets

Use this folder for local-only VRM validation before a model is promoted into `public/avatars/{avatarId}/`.

Do not commit `.vrm`, `.glb`, or `.gltf` files here unless the license is clear and the project intentionally promotes the model into the runtime avatar registry.

## Local Test Manifest

This folder contains a committed local-only manifest:

```text
assets/avatars/test-vrm/manifest.json
```

It is not part of `public/avatars/registry.json`. The Web app only appends it to the avatar list when opened with:

```text
http://localhost:3000?debug=1&avatar=local_alice_vrm_test
```

or:

```text
http://localhost:3000?localVrm=1&avatar=local_alice_vrm_test
```

The expected local model path is:

```text
assets/avatars/test-vrm/alice_test.vrm
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
