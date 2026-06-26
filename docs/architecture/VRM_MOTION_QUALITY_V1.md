# VRM Motion Quality V1

This document records the current VRM motion asset gate for Alice Web. It separates product-ready motion slots from QA-only VRMA assets so the project can keep testing real files without accidentally wiring unsuitable actions into the digital companion experience.

## Scope

- Avatar under test: `local_girl_vrm_test`
- Current product candidate slot: `wave`
- Current authored motion source: `assets/motions/vrm/test/VRMA_02Greeting.vrma`
- Motion sources under management: existing VRMA files in `assets/motions/vrm/test/` and user-provided Mixamo FBX files in `assets/motions/fbx/`.
- No binary motion files are downloaded by this phase.
- `VRMRenderer` remains an execution layer. Motion selection stays in `MotionManager` and avatar motion config.

## Motion Status

Motion assets use `qualityStatus`:

- `approved`: may be referenced by a formal product slot after visual QA and product semantics review.
- `qa`: may be loaded in QA mode for retarget and quality validation, but is not yet product-approved.
- `debugOnly`: may be loaded and played in `qa=motion`, but must not drive product behavior.
- `rejected`: may remain as a stress-test asset, but must not enter formal product mapping.

Formal `slots` may only reference `approved` assets. `qaSlots` must declare `qaOnly=true` and `productMapping=false`.

## Current VRMA Asset Registry

| Asset | File | Duration | Raw Channels | Runtime Tracks | Status | Product Decision |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `vrmaShowFullBody` | `VRMA_01Show full body.vrma` | 11.8s | 91 | 53 | `debugOnly` | QA framing/body-axis inspection only |
| `vrmaGreeting` | `VRMA_02Greeting.vrma` | 7.267s | 91 | 53 | `approved` | Current wave validation asset, not final standing wave |
| `vrmaPeace` | `VRMA_03Peace sign.vrma` | 11.684s | 91 | 53 | `debugOnly` | Candidate reference only |
| `vrmaShoot` | `VRMA_04Shoot.vrma` | 9.6s | 91 | 53 | `rejected` | Not suitable for companion semantics |
| `vrmaSpin` | `VRMA_05Spin.vrma` | 9.317s | 53 | 53 | `rejected` | Root-motion stress test only |
| `vrmaModelPose` | `VRMA_06Model pose.vrma` | 7.517s | 53 | 53 | `debugOnly` | Pose QA only |
| `vrmaSquat` | `VRMA_07Squat.vrma` | 11.517s | 53 | 53 | `rejected` | Hips/feet/secondary-motion stress test only |

`Shoot`, `Spin`, and `Squat` are explicitly blocked from formal product slots.

All seven files declare `VRMC_vrm_animation` spec version `1.0` and map 52 humanoid bones. The first four files also contain raw VRM/secondary node channels in the GLB animation, while the latter three use normalized humanoid node names. `createVRMAnimationClip()` converts each file to 53 runtime tracks for `girl.vrm`.

## Current Mixamo FBX Asset Registry

The FBX files are registered as QA-only `retargeted` motions. They must pass browser retarget QA before any product mapping is considered.

| Asset | File | Duration | Animated Bones | Hips Translation Delta X/Y/Z | Status | Product Decision |
| --- | --- | ---: | ---: | --- | --- | --- |
| `fbxStandingIdle` | `Standing Idle.fbx` | 6.0s | 52 | `1.1049 / 0.0525 / 0.9178` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion |
| `fbxTalking` | `Talking.fbx` | 3.933s | 52 | `12.8155 / 1.0437 / 2.2619` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion and root-drift risk |
| `fbxTalking1` | `Talking (1).fbx` | 3.767s | 52 | `2.9102 / 0.6524 / 4.0163` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion |
| `fbxTalking2` | `Talking (2).fbx` | 5.167s | 52 | `0.7933 / 0.2251 / 1.0426` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion |
| `fbxThinking` | `Thinking.fbx` | 4.233s | 52 | `16.6014 / 2.289 / 4.8063` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion and high root-drift risk |
| `fbxWaving` | `Waving.fbx` | 0.533s | 52 | `0.6659 / 0.4525 / 0.6858` | `debugOnly` | Retarget calibration only; browser QA shows T-pose arm distortion |

All six FBX files are Binary FBX version `7700`, expose Mixamo-style animated bones, and include `Lcl Rotation` plus `Lcl Translation` curves. They are tested through `AnimationRetargeter`, not played directly against VRM bones.

## Browser Visual QA

Browser QA used `local_girl_vrm_test`, `qa=motion`, full-body framing, and the configured `suppress` policy:

| Asset | Visual Result | Lifecycle Result | Final Status |
| --- | --- | --- | --- |
| Greeting | Full-body crouch/greeting followed by a two-hand wave. Stable during playback, but not a final standing wave. | Returns to idle with only base idle active. | `approved` as pipeline/wave candidate |
| Show full body | Clean weight shifts and presentation poses; no visible deformation. Too long and showcase-oriented for routine companion behavior. | Clean idle return. | `debugOnly` |
| Peace sign | Clean peace pose with pronounced whole-body lean and one-leg balance. Too long/static for a small daily gesture. | Clean idle return. | `debugOnly` |
| Shoot | Technically stable finger/aiming poses, but unsuitable companion semantics. | Clean idle return. | `rejected` |
| Spin | Large fashion/dance-like full-body poses and arm spread; not a restrained companion motion. | Clean idle return without root drift remaining. | `rejected` |
| Model pose | Clean fashion poses and hand shapes; useful as a pose-quality reference, not daily behavior. | Clean idle return. | `debugOnly` |
| Squat | Exercise/warm-up style body and arm poses; sampled frames do not read as a useful conversational gesture. | Clean idle return. | `rejected` |

During all seven files, the active fullBody action had weight `1`, procedural idle had weight `0`, secondary motion was suppressed, and completion left only base idle at weight `1`.

## Mixamo FBX Browser Retarget QA

Browser QA used `local_girl_vrm_test`, `qa=motion`, full-body framing, and the configured `suppress` policy. Each FBX was triggered through its stable `qaFbx*` motionId, not by raw filename.

Runtime evidence for all six FBX files:

- `motion.mode=retargeted`
- `motion.format=fbx`
- `motion.source=file`
- `motion.retarget=21/53 bones:20 scale:0`
- active fullBody action weight `1`
- base procedural idle weight `0` while the FBX action runs
- `motion.proceduralActive=false` while the FBX action runs
- completion returns to `idle` with only base idle weight `1`
- secondary motion restores after the configured `450ms` suppress recovery window

| MotionId | Visual Result | Retarget / Lifecycle Result | Final Status |
| --- | --- | --- | --- |
| `qaFbxStandingIdle` | Mid and late frames show both arms locked horizontally in a T-pose. This is not a usable standing idle. | Loads and plays as FBX, but current Mixamo-to-VRM retarget lacks rest-pose / shoulder-axis correction. Returns to idle cleanly. | `debugOnly` |
| `qaFbxTalking` | Mid and late frames show T-pose arms; no usable talking gesture is visible. Source hips/root translation is high. | Loads and plays, no action residue. Retarget visual quality failed. | `debugOnly` |
| `qaFbxTalking1` | Mid and late frames show T-pose arms; no usable talking gesture is visible. | Loads and plays, no action residue. Retarget visual quality failed. | `debugOnly` |
| `qaFbxTalking2` | Mid frame shows T-pose arms; late frame adds head dip / face occlusion but arms remain locked horizontally. | Loads and plays, no action residue. Retarget visual quality failed. | `debugOnly` |
| `qaFbxThinking` | Mid and late frames show T-pose arms; no usable thinking gesture is visible. Source hips/root translation is high. | Loads and plays, no action residue. Retarget visual quality failed. | `debugOnly` |
| `qaFbxWaving` | Short clip can be captured mid-action, but the visible pose remains T-pose rather than wave. | Loads and plays, no action residue. Retarget visual quality failed. | `debugOnly` |

Screenshot evidence was captured under:

```text
output/playwright/vrm-motion-quality-v1/qaFbx*-mid.png
output/playwright/vrm-motion-quality-v1/qaFbx*-late.png
```

Conclusion: the FBX pipeline is connected far enough to load, retarget by name, enter `AnimationMixer`, suppress procedural overlap, and return to idle. It is not product-ready. The blocker is the minimal retarget layer: it maps Mixamo source bones to VRM humanoid targets but does not yet apply rest-pose normalization, shoulder/arm axis correction, hips/root normalization, or scale handling.

## Debug QA Triggering

Use the QA URL:

```text
http://localhost:3001?debug=1&avatar=local_girl_vrm_test&qa=motion
```

In `qa=motion`, the Debug Panel shows a QA motion picker. It can trigger:

- `wave`
- `qaShowFullBody`
- `qaGreeting`
- `qaPeace`
- `qaShoot`
- `qaSpin`
- `qaModelPose`
- `qaSquat`
- `qaFbxStandingIdle`
- `qaFbxTalking`
- `qaFbxTalking1`
- `qaFbxTalking2`
- `qaFbxThinking`
- `qaFbxWaving`

Direct URL triggering is also supported:

```text
http://localhost:3001?debug=1&avatar=local_girl_vrm_test&qa=motion&motion=qaPeace
```

The picker is debug-only and does not add product UI.

## Runtime Debug Requirements

During motion QA, Debug Panel must expose:

- `motion.current`
- `motion.asset`
- `motion.quality`
- `motion.secondary`
- `motion.layer`
- `motion.mode`
- `motion.format`
- `motion.source`
- `motion.mixerActive`
- `motion.actions`
- `motion.retarget`
- `motion.lastError`
- `vrm.secondaryMotion`

For full-body VRMA playback, expected stable state is:

- the active fullBody action has weight `1`;
- procedural/base idle is weight `0` while the fullBody action runs;
- the fullBody action completes or is interrupted without leaving residual action weight;
- idle resumes after one-shot motion completion.

## Secondary Motion Policy

Supported per-motion policies:

- `keep`: leave VRM secondary motion running.
- `reset`: reset springBone state at action boundaries, but keep springBone running during the action.
- `suppress`: disable secondary motion while the action is active, then restore it on completion, interruption, avatar switch, or app destroy.

`secondaryMotionRestoreDelayMs` may delay `suppress` recovery until the base pose has faded back in. The current full-body VRMA QA entries use `450ms`, slightly longer than the `0.35s` idle transition, so `reset()` runs against the restored idle pose instead of the final authored action pose.

`wave` currently uses:

```json
"secondaryMotion": "suppress"
```

Browser A/B on `VRMA_02Greeting.vrma` showed:

- `keep`: hair springBone chains visibly explode during the crouch/greeting pose.
- `reset`: reset at start/end does not fix the in-action hair explosion.
- `suppress`: prevents the hair explosion and restores secondary motion after completion.

Therefore `wave -> suppress` remains the stable default.

## Group-Level SpringBone Control

Runtime inspection of three-vrm `3.5.3` shows a `springBoneManager` with public reset/update capability and observable collections such as joints/springBones/colliders. The current runtime does not expose a stable product-level API for enabling/disabling only selected springBone groups by semantic group name.

Do not ship a group-level `hair-suppress` policy by monkeypatching individual joint updates or private fields. A debug-only group experiment may be built later only if it uses a stable public API or a clearly isolated reversible adapter.

## Guard Checks

`npm run check:vrm-motion-assets` verifies:

- all 7 local VRMA files and 6 local FBX files are registered;
- VRMA GLB JSON contains `VRMC_vrm_animation`;
- FBX Binary data can be parsed for version, duration, animated bones, and hips/root motion;
- configured duration/channel/node counts match the files;
- motion entries have legal `mode`, `format`, `layer`, and `secondaryMotion`;
- formal `slots` do not reference `debugOnly` or `rejected` assets;
- formal `slots` do not reference `qa` assets;
- `Shoot`, `Spin`, and `Squat` are blocked from formal slots;
- QA slots are marked `qaOnly=true` and `productMapping=false`.

License tracking is maintained in `docs/architecture/MOTION_ASSET_LICENSES.md`. Any unverified commercial use, attribution, or redistribution status remains `pending verification`.

This check is included in `npm run check`.

## Next Missing Product Assets

The next useful licensed/owned motion assets are:

- standing `wave` with restrained upper-body motion;
- soft `talking` upper-body loop;
- subtle `idle breathing` loop;
- small `listening` and `thinking` loops;
- optional short gesture queue entries with compatible secondary-motion policy.
