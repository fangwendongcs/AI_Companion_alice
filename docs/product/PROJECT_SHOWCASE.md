# Project Showcase: AI Companion Alice

## One-line Summary

AI Companion Alice is a local AI digital companion prototype that combines 3D avatar interaction, state-driven dialogue, TTS fallback, backend AI boundaries, short-term Memory, local RAG, and optional workflow integration design.

## Project Positioning

This project is built as an **AI companion / embodied AI interface prototype**, not as a generic chatbot demo.

The core product idea is simple:

> An AI companion should not only answer text. It should have visible presence, interaction feedback, state transitions, voice, memory boundaries, and a clear path toward Agent-style capabilities.

The current repository turns that idea into a runnable local MVP with modular frontend systems and a backend boundary for future AI capability expansion.

## Target Reviewers

- AI product managers evaluating product thinking and execution depth.
- Frontend / AI engineers reviewing architecture and integration boundaries.
- Recruiters looking for evidence of end-to-end product prototyping ability.
- Potential collaborators interested in AI companion, digital human, or agent UX.

## User Experience Path

```text
Open local app
  -> default avatar loads
  -> switch Alice / Shiro / Wambo
  -> click head / body / arm / leg
  -> avatar reacts through motion slots
  -> user sends a message
  -> dialogue enters thinking / speaking states
  -> backend /api/dialogue returns a reply
  -> TTS or browser fallback plays
  -> companion returns to idle
  -> Debug Panel shows state and event changes
```

## Functional Modules

| Area | Current Capability |
| --- | --- |
| Avatar runtime | Three.js scene runtime with replaceable avatar loading path. |
| Avatar switching | Registry + manifest approach for Alice / Shiro / Wambo. |
| Interaction | Body-part hit detection mapped to standard interaction events. |
| Animation | Motion slots for intro / idle / click gestures / speaking / listening. |
| Dialogue | Frontend `DialogueManager` calls backend `/api/dialogue`. |
| Audio | Backend TTS proxy boundary plus browser speech fallback. |
| State visibility | Debug Panel and companion state store for runtime observability. |
| Backend boundary | Native Node HTTP routes and services for dialogue, TTS, avatars and provider status. |
| Memory | Backend process-level short-term session memory. |
| RAG | Local markdown / JSON keyword retrieval from `data/knowledge/`. |
| Workflow | Optional n8n webhook boundary on the backend. |
| Agent pipeline | Minimal Memory -> RAG -> optional Workflow -> PromptBuilder -> LLM/stub pipeline. |

## Technical Structure

```text
Frontend
  js/app/              app bootstrap and AppController
  js/avatar/           avatar manifest loading and character switching
  js/animation/        motion slots, controller, queue, state machine
  js/interaction/      hit testing and interaction manager
  js/dialogue/         dialogue manager
  js/audio/            audio manager
  js/voice/            TTS / speech services
  js/state/            companion state store
  js/ui/               UI controllers and debug panel

Backend
  backend/routes/      HTTP routing
  backend/services/    dialogue, LLM, Memory, RAG, n8n, avatars, upload validation
  backend/middleware/  CORS, error handling, optional API auth
  backend/config/      server and provider configuration

Validation
  scripts/             static checks, runtime contracts, smoke tests and flow checks
```

## Product Value

This prototype demonstrates several product and engineering choices that matter for AI companion systems:

- **Embodied interaction**: the companion has a visible avatar and motion feedback.
- **State clarity**: thinking, speaking, interaction and idle states can be observed and tested.
- **Replaceability**: avatars and motion slots are not meant to be hardcoded to a single character.
- **Backend safety**: provider keys, workflow secrets and future vector credentials stay outside frontend code.
- **MVP discipline**: the project separates current capability from planned capability through docs, checks and baselines.
- **Extensibility**: Memory, RAG, n8n and Agent orchestration are behind service boundaries rather than UI logic.

## Current Limits

The project is intentionally still a prototype:

- It is not deployed as a public production service.
- Default dialogue uses `stub` mode unless real backend provider keys are configured.
- Current RAG is local keyword retrieval, not embedding or vector search.
- Current Memory is short-term backend process memory, not a persistent user profile.
- Current n8n integration is an optional backend tool boundary.
- Current authentication is a private-demo token boundary, not a complete user account system.
- No committed screenshots / GIFs are included yet.

## Next Best Improvements

Recommended next work, in order:

1. Add screenshots / GIFs and a short product walkthrough.
2. Harden private demo deployment: CORS whitelist, rate limiting, structured logs and upload isolation.
3. Improve UI polish around dialogue state, source display and settings clarity.
4. Add vector RAG only after the local retrieval and source display experience is validated.
5. Upgrade Memory from process memory to a privacy-aware persistent design.

## Why This Matters

The project is valuable because it treats AI companion design as more than model calling. It connects product interaction, avatar embodiment, state management, backend safety and future Agent capability into one staged prototype.

That combination is the main signal: the repository shows not only code, but also product judgment, staged delivery, and awareness of how AI systems should evolve without exposing secrets or overbuilding too early.
