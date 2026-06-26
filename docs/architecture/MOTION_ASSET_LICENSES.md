# Motion Asset License Register

This register tracks motion asset provenance for Alice Web. It is intentionally conservative: if source, download date, commercial use, attribution, or redistribution rights are not directly verified in the repository, the status remains `pending verification`.

## Policy

- Do not move an asset from QA/debug into product behavior until license terms are verified.
- Do not redistribute motion assets outside this local project unless redistribution rights are verified.
- Keep raw filenames out of business logic. Use stable motion ids from `assets/avatars/test-vrm/motions.json`.

## VRMA Assets

| Motion Asset Id | File | Source / Link | Date Added | Intended Use | Commercial Use | Attribution | Redistribution | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `vrmaShowFullBody` | `assets/motions/vrm/test/VRMA_01Show full body.vrma` | User-provided local test asset; original source link pending | Pending verification | QA body-axis/showcase review | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `vrmaGreeting` | `assets/motions/vrm/test/VRMA_02Greeting.vrma` | User-provided local test asset; original source link pending | Pending verification | Current wave pipeline validation | Pending verification | Pending verification | Pending verification | `approved` for pipeline only |
| `vrmaPeace` | `assets/motions/vrm/test/VRMA_03Peace sign.vrma` | User-provided local test asset; original source link pending | Pending verification | QA candidate gesture review | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `vrmaShoot` | `assets/motions/vrm/test/VRMA_04Shoot.vrma` | User-provided local test asset; original source link pending | Pending verification | QA stress/reference only | Pending verification | Pending verification | Pending verification | `rejected` for companion semantics |
| `vrmaSpin` | `assets/motions/vrm/test/VRMA_05Spin.vrma` | User-provided local test asset; original source link pending | Pending verification | QA root-motion stress only | Pending verification | Pending verification | Pending verification | `rejected` |
| `vrmaModelPose` | `assets/motions/vrm/test/VRMA_06Model pose.vrma` | User-provided local test asset; original source link pending | Pending verification | QA pose-quality reference | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `vrmaSquat` | `assets/motions/vrm/test/VRMA_07Squat.vrma` | User-provided local test asset; original source link pending | Pending verification | QA hips/feet stress only | Pending verification | Pending verification | Pending verification | `rejected` |

## Mixamo FBX Assets

| Motion Asset Id | File | Source / Link | Date Added | Intended Use | Commercial Use | Attribution | Redistribution | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fbxStandingIdle` | `assets/motions/fbx/Standing Idle.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `fbxTalking` | `assets/motions/fbx/Talking.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `fbxTalking1` | `assets/motions/fbx/Talking (1).fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `fbxTalking2` | `assets/motions/fbx/Talking (2).fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `fbxThinking` | `assets/motions/fbx/Thinking.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |
| `fbxWaving` | `assets/motions/fbx/Waving.fbx` | Mixamo, user-provided local file; exact source URL pending | 2026-06-26, pending download-date verification | Retarget calibration only; not product-mapped | Pending verification | Pending verification | Pending verification | `debugOnly` |

## Open Items

- Add the original source URL for each file.
- Confirm exact download date for each file.
- Confirm whether commercial use is permitted for this project context.
- Confirm whether attribution is required in-app, in docs, or in portfolio materials.
- Confirm whether redistributing the raw files is permitted.
