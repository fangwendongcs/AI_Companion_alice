# Motion Asset License Register

This register tracks motion asset provenance for Alice Web. It is intentionally conservative: if source, download date, commercial use, attribution, or redistribution rights are not directly verified in the repository, the status remains `pending verification`.

## Policy

- Do not move a raw asset from QA/debug into public or distributable product behavior until license terms are verified.
- A calibrated derivative slot may run in the existing local demo only when it remains `releaseScope=local-only`, keeps `licenseStatus=pending verification`, filters the known-bad tracks, and preserves a procedural fallback. This is a runtime quality decision, not a license approval.
- Do not redistribute motion assets outside this local project unless redistribution rights are verified.
- Keep raw filenames out of business logic. Use stable motion ids from `assets/avatars/test-vrm/motions.json`.

## VRMA Assets

| Motion Asset Id | File | Source / Link | Date Added | Intended Use | Commercial Use | Attribution | Redistribution | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `vrmaShowFullBody` | `assets/motions/vrm/test/VRMA_01Show full body.vrma` | User-provided local test asset; original source link pending | Pending verification | QA body-axis/showcase review | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `debugOnly` |
| `vrmaGreeting` | `assets/motions/vrm/test/VRMA_02Greeting.vrma` | User-provided local test asset; original source link pending | Pending verification | Current wave pipeline validation | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `approved` for pipeline only |
| `vrmaPeace` | `assets/motions/vrm/test/VRMA_03Peace sign.vrma` | User-provided local test asset; original source link pending | Pending verification | QA candidate gesture review | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `debugOnly` |
| `vrmaShoot` | `assets/motions/vrm/test/VRMA_04Shoot.vrma` | User-provided local test asset; original source link pending | Pending verification | QA stress/reference only | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `rejected` for companion semantics |
| `vrmaSpin` | `assets/motions/vrm/test/VRMA_05Spin.vrma` | User-provided local test asset; original source link pending | Pending verification | QA root-motion stress only | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `rejected` |
| `vrmaModelPose` | `assets/motions/vrm/test/VRMA_06Model pose.vrma` | User-provided local test asset; original source link pending | Pending verification | QA pose-quality reference | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `debugOnly` |
| `vrmaSquat` | `assets/motions/vrm/test/VRMA_07Squat.vrma` | User-provided local test asset; original source link pending | Pending verification | QA hips/feet stress only | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/vroid-vrma/vrm动作.png`; `docs/assets/licenses/evidence/vroid-vrma/vrm动作2.png` | `rejected` |

## Mixamo FBX Assets

| Motion Asset Id | File | Source / Link | Date Added | Intended Use | Commercial Use | Attribution | Redistribution | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fbxStandingIdle` | `assets/motions/fbx/Standing Idle.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Raw full-body QA; filtered upper-body view used by local-only `idle/listening` slots | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | raw asset `debugOnly`; local calibrated slot only |
| `fbxTalking` | `assets/motions/fbx/Talking.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Raw full-body QA; filtered upper-body view used by local-only `chat` slot | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | raw asset `debugOnly`; local calibrated slot only |
| `fbxTalking1` | `assets/motions/fbx/Talking (1).fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Raw full-body QA; filtered upper-body view used by local-only `speaking` slot | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | raw asset `debugOnly`; local calibrated slot only |
| `fbxTalking2` | `assets/motions/fbx/Talking (2).fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | `debugOnly` |
| `fbxThinking` | `assets/motions/fbx/Thinking.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Raw full-body QA; filtered upper-body/head view used by local-only `thinking` slot | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | raw asset `debugOnly`; local calibrated slot only |
| `fbxWaving` | `assets/motions/fbx/Waving.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Raw full-body QA; filtered upper-body view used by local-only `intro/wave` slots | Pending verification | Pending verification | Pending verification | `docs/assets/licenses/evidence/mixamo/mixamo.png` | raw asset `debugOnly`; local calibrated slot only |

## Open Items

- Add the original source URL for each file.
- Confirm exact download date for each file.
- Confirm whether commercial use is permitted for this project context.
- Confirm whether attribution is required in-app, in docs, or in portfolio materials.
- Confirm whether redistributing the raw files is permitted.
