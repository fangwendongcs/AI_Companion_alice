# VRM Motion Retarget Readiness

This note records the minimum contract before Alice adds external humanoid motion files to VRM avatars.

## Current Baseline

- `local_girl_vrm_test` is loaded through three-vrm and exposes humanoid, expression, lookAt, and springBone runtime features.
- Body motion is still owned by `MotionManager` / `AnimationController`.
- `VRMRenderer` reports renderer capabilities and runs `vrm.update(delta)`, but it does not choose motion resources.
- The local girl VRM `motions.json` maps `intro / idle / listening / thinking / speaking / chat / wave` to calibrated local FBX file actions. Procedural versions remain registered only as failure fallbacks.
- The 7 local VRMA test files and 6 user-provided Mixamo FBX files are now registered and classified in `assets/avatars/test-vrm/motions.json`. See `docs/architecture/VRM_MOTION_QUALITY_V1.md` for the asset status gate, QA-only slots, and rejected-action boundaries.

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

## Local Calibrated Motion Placement

The local girl config consumes the existing Mixamo files through stable slots, not raw filenames in business code:

```text
Standing Idle.fbx -> idle, listening
Thinking.fbx     -> thinking
Talking (1).fbx  -> speaking
Talking.fbx      -> chat
Waving.fbx       -> intro, wave
```

Every formal local entry uses `mode=retargeted`, `source=file`, `releaseScope=local-only`, `calibrationProfile=mixamo-vrm-upper-body-v1`, and an include filter for upper-limb/torso tracks. `thinking` additionally retains head/neck. Hips and leg groups are excluded, so source root translation, crossed legs, and foot sliding do not reach the avatar. If a file cannot load or retarget, the same semantic slot keeps its procedural fallback.

Expected runtime evidence is `motion.mode=retargeted`, `motion.format=fbx`, `motion.source=file`, `motion.proceduralActive=false`, and `motion.tracks < motion.originalTracks`. The product runner at `scripts/qa/vrm-file-motion-product-runner.js` also samples normalized hips and both leg/foot chains against the idle baseline.

`qa=motion` still exposes raw `qaFbx*` and `qaGreeting` full-body entries. These remain `qaOnly=true` and `productMapping=false`; `Shoot`, `Spin`, and `Squat` remain rejected. The original `VRMA_02Greeting.vrma` is now `qaGreeting`, uses `layer=fullBody` plus `secondaryMotion=suppress`, and is not the formal standing `wave`.

The local-only exception does not verify the underlying license. Public distribution still requires source and redistribution terms to be verified and the binary moved into an approved publishable asset path.

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
- `motion.actions`
- `motion.retargetReady`
- `motion.proceduralActive`
- `motion.lastError`
- `qa.mode`
- `qa.springReset`
- `vrm.springBoneReset`
- `vrm.springBoneResetAt`

For the girl VRM, `motion.retargetReady=true` only means the required humanoid bones are available. It does not mean an arbitrary FBX will look natural without rotation correction and visual QA.
