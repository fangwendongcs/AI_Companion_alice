# Dialogue Contract

This document defines the renderer-agnostic `/api/dialogue` response contract shared by Web and future iOS clients.

The goal is to keep Dialogue / Memory / Persona / Emotion independent from FBX, VRM, Rive, skeleton names, animation files, or renderer-specific input fields. Renderers should map the semantic directive to their own local implementation.

## Current Version

```text
dialogue.v1
```

`POST /api/dialogue` still returns the existing Web-compatible fields:

- `reply`
- `sources`
- `memory`
- `rag`
- `workflow`
- `affect`
- `meta`

Phase 5.10 adds stable cross-client fields without removing the legacy-compatible shape:

```json
{
  "reply": "Alice 的回复",
  "reply_text": "Alice 的回复",
  "companion_state": "speaking",
  "emotion": {
    "name": "warm",
    "intensity": 0.72
  },
  "tone": "gentle",
  "avatar_directive": {
    "state": "speaking",
    "emotion": "warm",
    "gesture": "soft_nod",
    "gaze": "user",
    "lip_sync": "auto",
    "intensity": 0.72
  },
  "memory_event": {
    "short_context_updated": true,
    "long_term_memory_changed": false,
    "badge": "context",
    "status": "ready",
    "session_id": "default",
    "avatar_id": "alice"
  },
  "tts": {
    "status": "pending",
    "audio_url": null
  },
  "contract": {
    "version": "dialogue.v1",
    "renderer_agnostic": true,
    "consumer": "web_ios_shared_backend"
  }
}
```

## Request Shape

The current request remains:

```json
{
  "message": "你好",
  "provider": "stub",
  "model": "stub",
  "systemPrompt": "",
  "sessionId": "default",
  "avatarId": "alice",
  "options": {
    "useMemory": true,
    "useRag": false,
    "useWorkflow": false
  }
}
```

`avatarId` selects persona / memory scope. It must not select renderer-specific assets inside backend business logic.

## Semantic Objects

### CompanionState

Allowed values:

```text
idle | listening | thinking | speaking
```

`/api/dialogue` success currently returns `speaking`, because the reply is ready for text display, TTS, and avatar feedback. Clients may still use local events to show `thinking` before the response arrives.

### EmotionState

Allowed values:

```text
neutral | warm | happy | curious | thinking | apologetic | concerned
```

`emotion.intensity` is always `0..1`.

### AvatarDirective

Renderer-agnostic fields:

```text
state
emotion
gesture
gaze
lip_sync
intensity
```

Allowed semantic gesture values:

```text
none | soft_nod | thinking | wave
```

Allowed gaze values:

```text
user | away | down
```

Allowed lip sync values:

```text
none | auto | basic
```

The backend must not return:

- `animationFile`
- `fbxPath`
- `riveInput`
- `vrmExpressionPreset`
- `boneName`
- hardcoded animation paths

### MemoryEvent

`memory_event` is a compact, cross-client status. It does not replace detailed `memory`, but gives Web / iOS a stable badge source:

```text
off | none | context | memory | long_term
```

Detailed memory records stay behind `/api/memory` and current `memory.longTerm`; raw messages are not exposed in bulk.

## Web Consumption

Current Web keeps using:

- `reply` for dialogue text.
- `affect.voice` for browser TTS rate / pitch hints.
- `avatar_directive` first, then legacy `affect.motion.slot` as fallback for existing MotionManager mapping.
- `memory` and `memory_event` for Debug / Memory UI.

The FBX renderer remains a presentation layer. It maps semantic directive values to local motion slots. It does not decide persona, memory, emotion, tone, or dialogue policy.

## iOS Consumption

Future iOS clients should call the same local backend:

```text
http://localhost:3000
```

For iOS Simulator, `localhost` usually points to the Mac host. For a physical device, use the Mac LAN IP and keep the backend bound to an allowed interface during development.

iOS should consume:

- `reply_text` for text display.
- `companion_state` for high-level state.
- `emotion` and `tone` for status UI.
- `avatar_directive` for avatar / Rive / native view mapping.
- `memory_event.badge` for lightweight memory indicators.
- `tts.status` as a signal that audio is handled by the client or a separate TTS endpoint.

iOS should not depend on Web renderer code, Three.js, FBX, skeleton names, or Web motion queue internals.

## Compatibility

`reply`, `affect`, and `meta` are retained for the current Web client. They are legacy-compatible fields, not a second business contract.

New cross-client code should prefer:

- `reply_text`
- `companion_state`
- `emotion`
- `tone`
- `avatar_directive`
- `memory_event`
- `tts`
- `contract.version`

## Validation

`npm run check:dialogue-contract` verifies:

- `/api/dialogue` has the cross-client fields.
- legacy `reply` still works.
- renderer-specific fields do not appear in the response.
- Web client code can preserve `avatar_directive`.
- API docs mention `dialogue.v1`.
