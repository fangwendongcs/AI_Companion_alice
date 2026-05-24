# Project Showcase: AI Companion Alice

## One-line Summary

AI Companion Alice is a local AI digital companion prototype that combines 3D avatar interaction, state-driven dialogue, TTS fallback, backend AI boundaries, short-term Memory, local RAG, and optional workflow integration design.

## Project Positioning

I built this as an **AI companion / embodied AI interface prototype**, not as a generic chatbot demo.

The core product idea is simple:

> I do not want an AI companion to be only a text reply box. I want it to have visible presence, interaction feedback, state transitions, voice, memory boundaries, and a clear path toward Agent-style capabilities.

The current repository turns that idea into a runnable local MVP with modular frontend systems and a backend boundary for future AI capability expansion.

## What I Want Reviewers to Notice

- The project is not only a visual demo; it has product thinking, architecture boundaries, and validation scripts.
- I treated AI capability as a backend product system, not something to hardcode into the browser.
- I kept current capabilities and future directions separated, so the project can grow without pretending everything is production-ready.
- I used the prototype to explore AI companion UX: avatar presence, interaction feedback, state, voice, memory, and agent boundaries.

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

In this prototype, I focused on several product and engineering choices that matter for AI companion systems:

- **Embodied interaction**: the companion has a visible avatar and motion feedback.
- **State clarity**: thinking, speaking, interaction and idle states can be observed and tested.
- **Replaceability**: avatars and motion slots are not meant to be hardcoded to a single character.
- **Backend safety**: provider keys, workflow secrets and future vector credentials stay outside frontend code.
- **MVP discipline**: the project separates current capability from planned capability through docs, checks and baselines.
- **Extensibility**: Memory, RAG, n8n and Agent orchestration are behind service boundaries rather than UI logic.

## Product Maturity

I currently treat the project as a local MVP with a strong architecture baseline. It already demonstrates the core companion loop and backend intelligence boundaries while keeping future production concerns staged and explicit:

- Local `stub` mode keeps the demo runnable without secrets.
- Real providers are expected to enter through backend environment variables.
- RAG is currently local retrieval, with a clear path toward vector search.
- Memory is short-term session memory, with a path toward privacy-aware persistence.
- n8n is treated as an optional backend tool boundary, not as a frontend secret or main orchestrator.
- Deployment security has a baseline and can be hardened before public exposure.

## My Next Build Focus

My next work is focused on making the prototype easier to show, safer to expose, and clearer to evaluate:

1. Add screenshots / GIFs and a short product walkthrough.
2. Harden private demo deployment: CORS whitelist, rate limiting, structured logs and upload isolation.
3. Improve UI polish around dialogue state, source display and settings clarity.
4. Move to vector RAG after the local retrieval and source display experience is validated.
5. Upgrade Memory from process memory to a privacy-aware persistent design.

## Why This Matters

The project matters to me because it treats AI companion design as more than model calling. It connects product interaction, avatar embodiment, state management, backend safety and future Agent capability into one staged prototype.

That combination is the main signal I want the repository to show: not only code, but also product judgment, staged delivery, and a practical sense of how AI systems can evolve without exposing secrets or overbuilding too early.
