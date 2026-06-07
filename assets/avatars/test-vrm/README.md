# Local VRM Test Assets

Use this folder for local-only VRM validation before a model is promoted into `public/avatars/{avatarId}/`.

Do not commit `.vrm`, `.glb`, or `.gltf` files here unless the license is clear and the project intentionally promotes the model into the runtime avatar registry.

Recommended checklist before promotion:

- License is explicit and compatible with public repository usage.
- VRM version and humanoid rig are known.
- Expressions include at least neutral / happy / sad / blink or acceptable fallbacks.
- Texture size and polygon count are suitable for Web rendering.
- The model loads through `public/avatars/{avatarId}/manifest.json`.
