# VRM Motion Retarget Readiness

This note records the minimum contract before Alice adds external humanoid motion files to VRM avatars.

## Current Baseline

- `local_girl_vrm_test` is loaded through three-vrm and exposes humanoid, expression, lookAt, and springBone runtime features.
- Body motion is still owned by `MotionManager` / `AnimationController`.
- `VRMRenderer` reports renderer capabilities and runs `vrm.update(delta)`, but it does not choose motion resources.
- The local girl VRM `motions.json` currently uses procedural fallbacks only.

## Recommended Motion Config Fields

Future VRM motion entries should keep renderer-specific decisions in avatar config, not in dialogue or TTS code:

```json
{
  "id": "idle_breathing_vrm_test",
  "renderer": "vrm",
  "source": "local",
  "format": "fbx",
  "mode": "retargeted",
  "file": "assets/avatars/test-vrm/motions/idle.fbx",
  "loop": "repeat",
  "fadeIn": 0.25,
  "fadeOut": 0.25,
  "layer": "base",
  "fallback": "idle"
}
```

Field guidance:

- `id`: stable motion id or slot id.
- `renderer`: target renderer family, such as `vrm` or `default`.
- `source`: asset source label, such as `local`, `licensed`, or `generated`.
- `format`: file format, such as `fbx`, `glb`, `vrma`, or `bvh`.
- `mode`: `procedural`, `external`, or `retargeted`.
- `loop`: `repeat` or `once`.
- `layer`: `base`, `upperBody`, `gesture`, or `face`.
- `fallback`: safe slot to use when loading or retargeting fails.

## Manual Test Motion Placement

This repository does not currently include an authorized external `wave` motion file for `local_girl_vrm_test`.

The local girl VRM config reserves one test slot at:

```text
assets/motions/vrm/test/wave.fbx
```

Use this slot only with a motion file whose source and license are explicitly verified. If the file is absent, Alice must keep loading the avatar, report `motion.lastError`, and fall back to the procedural `wave` / `idle` behavior. A missing test file is configuration readiness, not proof that external motion has entered the mixer.

Expected debug state after a valid authorized file is placed and the `wave` slot is triggered:

- `motion.current=wave`
- `motion.mode=retargeted`
- `motion.source=file`
- `motion.mixerActive=true`

Expected debug state while the file is absent:

- `motion.current=idle`
- `motion.mode=procedural`
- `motion.source=procedural`
- `motion.lastError=motion_file_missing_or_failed:wave:assets/motions/vrm/test/wave.fbx`

## Retarget Risks

Mixamo / FBX motions must not be treated as automatically compatible with VRM.

Check these risks before enabling any motion broadly:

- `hips` / root motion may shift the model away from its normalized scene position.
- Model scale and source animation scale may differ.
- Quaternion axes can differ around shoulders and upper arms.
- Feet can slide when source stride and VRM leg length do not match.
- Neck and head tracks can fight lookAt if both write the same bones.
- Procedural base fallback should not remain active on the same layer when a retargeted base action is active.

## Readiness Signal

The Debug Panel should expose:

- `motion.current`
- `motion.mode`
- `motion.source`
- `motion.mixerActive`
- `motion.retargetReady`
- `motion.proceduralActive`
- `motion.lastError`

For the girl VRM, `motion.retargetReady=true` only means the required humanoid bones are available. It does not mean an arbitrary FBX will look natural without rotation correction and visual QA.
