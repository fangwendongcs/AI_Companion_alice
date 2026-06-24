# VRM Motion Quality V1

This document records the current VRM motion asset gate for Alice Web. It separates product-ready motion slots from QA-only VRMA assets so the project can keep testing real files without accidentally wiring unsuitable actions into the digital companion experience.

## Scope

- Avatar under test: `local_girl_vrm_test`
- Current product candidate slot: `wave`
- Current authored motion source: `assets/motions/vrm/test/VRMA_02Greeting.vrma`
- No new binary motion files are added by this phase.
- `VRMRenderer` remains an execution layer. Motion selection stays in `MotionManager` and avatar motion config.

## Motion Status

Motion assets use `qualityStatus`:

- `approved`: may be referenced by a formal product slot after visual QA and product semantics review.
- `debugOnly`: may be loaded and played in `qa=motion`, but must not drive product behavior.
- `rejected`: may remain as a stress-test asset, but must not enter formal product mapping.

Formal `slots` may only reference `approved` assets. `qaSlots` must declare `qaOnly=true` and `productMapping=false`.

## Current Asset Registry

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
- `motion.source`
- `motion.mixerActive`
- `motion.actions`
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

- all 7 local VRMA files are registered;
- VRMA GLB JSON contains `VRMC_vrm_animation`;
- configured duration/channel/node counts match the files;
- motion entries have legal `mode`, `format`, `layer`, and `secondaryMotion`;
- formal `slots` do not reference `debugOnly` or `rejected` assets;
- `Shoot`, `Spin`, and `Squat` are blocked from formal slots;
- QA slots are marked `qaOnly=true` and `productMapping=false`.

This check is included in `npm run check`.

## Next Missing Product Assets

The next useful licensed/owned motion assets are:

- standing `wave` with restrained upper-body motion;
- soft `talking` upper-body loop;
- subtle `idle breathing` loop;
- small `listening` and `thinking` loops;
- optional short gesture queue entries with compatible secondary-motion policy.
