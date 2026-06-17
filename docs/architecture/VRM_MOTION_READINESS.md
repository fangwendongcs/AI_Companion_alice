# VRM Motion Retarget Readiness

This note records the minimum contract before Alice adds external humanoid motion files to VRM avatars.

## Current Baseline

- `local_girl_vrm_test` is loaded through three-vrm and exposes humanoid, expression, lookAt, and springBone runtime features.
- Body motion is still owned by `MotionManager` / `AnimationController`.
- `VRMRenderer` reports renderer capabilities and runs `vrm.update(delta)`, but it does not choose motion resources.
- The local girl VRM `motions.json` has one authorized test entry for the `wave` slot; other routine body motion still relies on procedural fallbacks unless explicitly configured.

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

The local VRM validation setup uses a single external `wave` motion entry for `local_girl_vrm_test`.

The local girl VRM config points the test slot at:

```text
assets/motions/vrm/test/VRMA_02Greeting.vrma
```

Use this slot only with a motion file whose source and license are explicitly verified. If the file is absent or fails to load, Alice must keep loading the avatar, report `motion.lastError`, and fall back to the procedural `wave` / `idle` behavior. A missing or failed test file is configuration readiness, not proof that external motion has entered the mixer.

Expected debug state after a valid authorized file is placed and the `wave` slot is triggered:

- `motion.current=wave`
- `motion.mode=vrma`
- `motion.source=file`
- `motion.mixerActive=true`

Use this debug URL when visually checking body shape, feet, hips, shoulders, hair, and clothing deformation:

```text
http://localhost:3001?debug=1&avatar=local_girl_vrm_test&motion=wave&qa=motion
```

`qa=motion` is a debug-only layout mode. It hides the bottom input dock and interaction hint so the full body stays visible during motion QA. It does not change the animation pipeline.

To A/B test the observed hair / clothing stretch after the VRMA gesture, enable the debug-only secondary motion reset:

```text
http://localhost:3001?debug=1&avatar=local_girl_vrm_test&motion=wave&qa=motion&springReset=gestureEnd
```

`springReset=gestureEnd` only applies with `qa=motion`. It triggers one `VRMRenderer.resetSecondaryMotion()` call after a `vrma` gesture action completes. Use `qa.springReset` and `vrm.springBoneResetAt` in the Debug Panel to confirm whether the reset path ran. This is a controlled QA experiment, not a default animation policy.

`VRMA_02Greeting.vrma` contains full-body tracks, including hips, spine/chest, neck/head, arms, and legs. It should be applied as a full-body one-shot action rather than as a small overlaid gesture. The local girl VRM config therefore uses:

```json
"layer": "fullBody",
"baseWeightWhileActive": 0
```

This lets the original VRMA file drive the complete humanoid pose while the procedural idle layer fades out during playback. Debug should show `motion.layer=fullBody` and `motion.tracks=53`.

Expected debug state while the file is absent:

- `motion.current=idle`
- `motion.mode=procedural`
- `motion.source=procedural`
- `motion.lastError=motion_file_missing_or_failed:wave:assets/motions/vrm/test/VRMA_02Greeting.vrma`

## Retarget Risks

Mixamo / FBX motions must not be treated as automatically compatible with VRM.

Check these risks before enabling any motion broadly:

- `hips` / root motion may shift the model away from its normalized scene position.
- Model scale and source animation scale may differ.
- Quaternion axes can differ around shoulders and upper arms.
- Feet can slide when source stride and VRM leg length do not match.
- Neck and head tracks can fight lookAt if both write the same bones.
- Procedural base fallback should not remain active on the same layer when a retargeted base action is active.
- Hair and clothing can keep stretching after a large gesture when spring bones settle slowly. Treat `vrm.springBoneReset=true` as a capability signal for a later A/B test, not as proof that secondary motion quality is solved.
- Full-body VRMA files should not be played directly as small gesture slots unless they are masked or filtered. Otherwise head/chest/hips/legs tracks can fight idle posture, lookAt, and spring-bone roots.
- If the goal is to display the original authored VRMA, prefer `layer=fullBody` over filtering. Filtering is only for deliberately creating a partial-body gesture from a full-body file.
- VRM procedural fallback should target normalized humanoid bones when three-vrm is available. Mixing raw-bone procedural clips with normalized VRMA clips can make untouched limbs or secondary-motion roots drift toward the default pose.

## Readiness Signal

The Debug Panel should expose:

- `motion.current`
- `motion.layer`
- `motion.mode`
- `motion.source`
- `motion.mixerActive`
- `motion.mixerRoot`
- `motion.tracks`
- `motion.retargetReady`
- `motion.proceduralActive`
- `motion.lastError`
- `qa.mode`
- `qa.springReset`
- `vrm.springBoneReset`
- `vrm.springBoneResetAt`

For the girl VRM, `motion.retargetReady=true` only means the required humanoid bones are available. It does not mean an arbitrary FBX will look natural without rotation correction and visual QA.
