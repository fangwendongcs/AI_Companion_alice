# VRM Motion Quality V1

This document records the current VRM motion asset gate for Alice Web. It separates product-ready motion slots from QA-only VRMA assets so the project can keep testing real files without accidentally wiring unsuitable actions into the digital companion experience.

## Scope

- Avatar under test: `local_girl_vrm_test`
- Current local-demo file slots: `intro / idle / listening / thinking / speaking / chat / wave`
- Current authored local-demo source: calibrated upper-body views of the Mixamo FBX files in `assets/motions/fbx/`
- Motion sources under management: existing VRMA files in `assets/motions/vrm/test/` and user-provided Mixamo FBX files in `assets/motions/fbx/`.
- No binary motion files are downloaded by this phase.
- `VRMRenderer` remains an execution layer. Motion selection stays in `MotionManager` and avatar motion config.

## Motion Status

Motion assets use `qualityStatus`:

- `approved`: may be referenced by a formal product slot after visual QA and product semantics review.
- `qa`: may be loaded in QA mode for retarget and quality validation, but is not yet product-approved.
- `debugOnly`: may be loaded and played in `qa=motion`, but must not drive product behavior.
- `rejected`: may remain as a stress-test asset, but must not enter formal product mapping.

Raw assets retain their audit status. Formal public/distributable slots may only reference `approved` and license-verified assets. A local-only slot may reference a raw `debugOnly` FBX only when the slot itself declares `localUseApproved=true`, `releaseScope=local-only`, an explicit calibration profile, and a track filter that removes the known bad hips/root/leg channels. `qaSlots` still declare `qaOnly=true` and `productMapping=false`.

V1.1 also separates the status dimensions that were previously easy to conflate:

- `technicalStatus`: whether the file can load, enter the mixer, retarget if needed, and complete without lifecycle residue.
- `productStatus`: whether the motion is suitable for Alice's daily companion behavior.
- `licenseStatus`: whether commercial use, attribution, and redistribution have been verified.

Current Mixamo FBX files are technically playable but visually incorrect after the minimal retarget pass, so they are registered as:

```json
{
  "technicalStatus": "playableWithRetargetIssues",
  "productStatus": "debugOnly",
  "licenseStatus": "pending verification"
}
```

A public/distributable product interaction candidate must satisfy all of these before `MotionManager` allows it through `interactionIntents`:

- `qualityStatus=approved`
- `technicalStatus=playable`
- `productStatus=approved`
- `licenseStatus=verified`

The local demo has one narrow exception: a slot with `calibrationProfile=mixamo-vrm-upper-body-v1`, `releaseScope=local-only`, enabled `trackFilter`, and `licenseStatus=pending verification` may run on the current machine. This exception does not upgrade the raw asset or grant redistribution rights.

## Unified Motion Call Path

Upper layers use stable semantic ids and do not depend on raw filenames or motion formats:

```text
InteractionManager
  -> interaction intent (`interaction.greeting`, `interaction.headTap`, ...)
  -> AppController.triggerReaction()
  -> MotionManager.requestIntent()
  -> MotionManager.requestSlot()
  -> AnimationController / AnimationRegistry
  -> VRMA loader, FBX retarget adapter, or procedural fallback
```

For the current local VRM test avatar, `interaction.greeting` resolves directly to the formal local-only `wave` slot backed by `Waving.fbx`. `interaction.chat` resolves to `Talking.fbx`. Both go through normalized humanoid retargeting and keep only upper-limb/torso tracks; missing or failed files still fall back to the configured procedural slot without blocking the avatar.

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

| Asset | File | Duration | Animated Bones | Hips Translation Delta X/Y/Z | Status | Technical Status | Product Decision |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| `fbxStandingIdle` | `Standing Idle.fbx` | 6.0s | 52 | `1.1049 / 0.0525 / 0.9178` | `debugOnly` | `playableWithRetargetIssues` | Normalized retarget removes T-pose, but visual QA shows crossed legs and pose-heavy idle |
| `fbxTalking` | `Talking.fbx` | 3.933s | 52 | `12.8155 / 1.0437 / 2.2619` | `debugOnly` | `playableWithRetargetIssues` | Hand gesture is visible, but full-body turn, root motion, and crossed feet are too strong |
| `fbxTalking1` | `Talking (1).fbx` | 3.767s | 52 | `2.9102 / 0.6524 / 4.0163` | `debugOnly` | `playableWithRetargetIssues` | Best talking reference so far, but still foot-crossed and pose-like |
| `fbxTalking2` | `Talking (2).fbx` | 5.167s | 52 | `0.7933 / 0.2251 / 1.0426` | `debugOnly` | `playableWithRetargetIssues` | Side-facing posture and leg/root issues make it unsuitable as talking soft |
| `fbxThinking` | `Thinking.fbx` | 4.233s | 52 | `16.6014 / 2.289 / 4.8063` | `debugOnly` | `playableWithRetargetIssues` | Thinking pose is readable, but hips/root and foot placement are not stable enough |
| `fbxWaving` | `Waving.fbx` | 0.533s | 52 | `0.6659 / 0.4525 / 0.6858` | `debugOnly` | `playableWithRetargetIssues` | Gesture is visible after normalized retarget, but it is side-sweeping rather than a natural front-facing wave |

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
- target bones are now three-vrm normalized humanoid nodes, for example `Normalized_J_Bip_L_UpperArm`, not raw `J_Bip_L_UpperArm`
- active fullBody action weight `1`
- base procedural idle weight `0` while the FBX action runs
- `motion.proceduralActive=false` while the FBX action runs
- completion returns to `idle` with only base idle weight `1`
- secondary motion restores after the configured `450ms` suppress recovery window

| MotionId | Visual Result | Retarget / Lifecycle Result | Final Status |
| --- | --- | --- | --- |
| `qaFbxStandingIdle` | Arms no longer T-pose, but the motion reads as crossed-leg pose with hands held forward, not a stable idle. | Loads and plays, no action residue, returns to idle cleanly. Product visual quality failed. | `debugOnly` |
| `qaFbxTalking` | Visible hand gesture, but the full-body turn, crossed feet, and root motion are too pronounced for talking soft. | Loads and plays, no action residue, returns to idle cleanly. | `debugOnly` |
| `qaFbxTalking1` | Most readable talking gesture among the three variants, but foot crossing and pose-heavy stance remain. | Loads and plays, no action residue, returns to idle cleanly. | `debugOnly` |
| `qaFbxTalking2` | Side-facing posture, crossed legs, and root/hips pose are unsuitable for a conversational loop. | Loads and plays, no action residue, returns to idle cleanly. | `debugOnly` |
| `qaFbxThinking` | Thinking hand pose is readable, but hips/root and feet are not stable enough for product use. | Loads and plays, no action residue, returns to idle cleanly. | `debugOnly` |
| `qaFbxWaving` | Right-arm greeting/wave is visible, but it reads as side-sweeping and not a natural front-facing standing wave. | Loads and plays, no action residue, returns to idle cleanly. | `debugOnly` |

Screenshot evidence was captured under:

```text
output/playwright/vrm-motion-quality-v1-1/qaFbx*-mid.png
output/playwright/vrm-motion-quality-v1-1/qaFbx*-late.png
```

Conclusion for raw full-body playback: the FBX pipeline loads, retargets by name, enters `AnimationMixer`, suppresses procedural overlap, and returns to idle. The normalized humanoid retarget fix removes the previous T-pose blocker, but the raw full-body views remain QA-only because root/hips/feet are unsuitable and license status is still `pending verification`.

## Local Demo Calibrated File Slots

The local demo now derives restrained upper-body actions from the useful parts of the raw FBX files. It does not copy or rewrite the binary files. The runtime filters tracks after retargeting so hips, upper/lower legs, feet, and toes remain on the stable VRM base pose.

| Slot | File asset | Layer / loop | Retained tracks | Safe fallback |
| --- | --- | --- | --- | --- |
| `intro` | `fbxWaving` | gesture / once | upper limbs + torso | procedural `intro` |
| `idle` | `fbxStandingIdle` | base / repeat | upper limbs + torso | procedural `idle` |
| `listening` | `fbxStandingIdle` | base / repeat | upper limbs + torso | procedural `listening` |
| `thinking` | `fbxThinking` | base / repeat | upper limbs + torso + head | procedural `thinking` |
| `speaking` | `fbxTalking1` | base / repeat | upper limbs + torso | procedural `speaking` |
| `chat` | `fbxTalking` | gesture / once | upper limbs + torso | procedural `chat` |
| `wave` | `fbxWaving` | gesture / once | upper limbs + torso | procedural `wave` |

Browser verification on 2026-08-10 confirmed every slot reports `source=file`, `format=fbx`, `mode=retargeted`, `qaOnly=false`, and `proceduralActive=false`. Retargeting matched `21/53` source tracks across 20 target bones; the calibrated clips retained 11 tracks, or 13 for `thinking`. Sampled normalized hips and both leg/foot chains remained bit-for-bit equal to the idle baseline, and screenshots showed straight planted legs without the raw crossed-foot/root drift. Evidence is under `output/playwright/vrm-file-motion-product/`.

## Repeatable QA Runners

Browser QA uses:

```text
http://localhost:3001?debug=1&avatar=local_girl_vrm_test&qa=motion
```

The calibrated product-slot runner is tracked at:

```text
scripts/qa/vrm-file-motion-product-runner.js
```

It verifies all seven local-demo slots, exact file asset ids, file/FBX/retargeted debug state, track filtering, procedural suppression, stable hips/legs/feet, greeting intent resolution, screenshots, and final idle recovery.

The lifecycle runner is tracked at:

```text
scripts/qa/vrm-motion-lifecycle-runner.js
```

It verifies:

- initial idle is the calibrated file-backed FBX slot with no gesture/fullBody action, queue, or secondary-motion suppression;
- `interaction.greeting` resolves to the calibrated file-backed `wave` without fallback;
- repeated model clicks settle back to idle without active request, queued action, or secondary-motion residue;
- raw `qaGreeting` starts as fullBody `vrma` with `secondaryMotion=suppress`;
- a fullBody `qaGreeting` followed by `interaction.greeting` is interrupted by the calibrated `wave` gesture without fullBody/gesture overlap;
- `qaFbxStandingIdle` enters the `retargeted` FBX debug-only path and cuts back to idle cleanly;
- switching to `local_boy_vrm_test` and back to `local_girl_vrm_test` settles with only base idle active;
- a missing motion id fails safely with `motion_not_registered:*` and leaves the avatar in idle.

The FBX retarget visual sampling runner is tracked at:

```text
scripts/qa/vrm-fbx-retarget-qa-runner.js
```

It triggers all six registered FBX QA slots, samples mid/late browser frames, records active actions and retarget debug state, and writes screenshots under:

```text
output/playwright/vrm-motion-quality-v1-1/
```

Run with the Playwright wrapper from the Codex desktop environment:

```bash
mkdir -p output/playwright/vrm-motion-quality-v1-1
PORT=3001 npm run dev
/Users/fangwendong/.codex/skills/playwright/scripts/playwright_cli.sh --session alice-vrm-motion-v1-1 open 'http://localhost:3001?debug=1&avatar=local_girl_vrm_test&qa=motion' --headed
/Users/fangwendong/.codex/skills/playwright/scripts/playwright_cli.sh --session alice-vrm-motion-v1-1 run-code --filename scripts/qa/vrm-file-motion-product-runner.js
/Users/fangwendong/.codex/skills/playwright/scripts/playwright_cli.sh --session alice-vrm-motion-v1-1 run-code --filename scripts/qa/vrm-motion-lifecycle-runner.js
/Users/fangwendong/.codex/skills/playwright/scripts/playwright_cli.sh --session alice-vrm-motion-v1-1 run-code --filename scripts/qa/vrm-fbx-retarget-qa-runner.js
```

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

The raw full-body `qaGreeting` currently uses:

```json
"secondaryMotion": "suppress"
```

Browser A/B on `VRMA_02Greeting.vrma` showed:

- `keep`: hair springBone chains visibly explode during the crouch/greeting pose.
- `reset`: reset at start/end does not fix the in-action hair explosion.
- `suppress`: prevents the hair explosion and restores secondary motion after completion.

Therefore `qaGreeting -> suppress` remains the stable raw-file QA policy. The calibrated upper-body `wave` uses `secondaryMotion=keep` because it no longer drives hips/legs or the full-body crouch.

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
- formal public slots do not reference unapproved assets; the narrow local-only calibrated exception requires its profile, scope, track filter, root-motion stripping, and procedural fallback fields;
- calibrated slots keep hips/legs out of their include filters and point to the expected file assets;
- `Shoot`, `Spin`, and `Squat` are blocked from formal slots;
- QA slots are marked `qaOnly=true` and `productMapping=false`.

License tracking and raw evidence screenshots are maintained under `docs/assets/licenses/`. Any unverified commercial use, attribution, or redistribution status remains `pending verification`.

This check is included in `npm run check`.

## Next Missing Product Assets

For distribution, the next useful licensed/owned replacements are:

- standing `wave` with restrained upper-body motion;
- soft `talking` upper-body loop;
- subtle `idle breathing` loop;
- small `listening` and `thinking` loops;
- optional short gesture queue entries with compatible secondary-motion policy.
