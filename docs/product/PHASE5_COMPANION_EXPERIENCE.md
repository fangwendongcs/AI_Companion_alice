# Phase 5 Companion Experience

## Product Position

AI Companion Alice is a digital companion project, not an enterprise knowledge-base Q&A system.

The next product direction is to make the companion feel more continuous, personal, and responsive in Chinese conversation. RAG, Qdrant, and n8n remain useful extension points, but they are not the main Phase 5 experience driver.

## Experience Priorities

1. Memory that feels controllable and respectful.
2. Persona that makes Alice / Shiro / Wambo feel meaningfully different.
3. Conversation continuity across sessions.
4. Voice, motion, and emotional state feedback that match the dialogue state.
5. Clear recovery when the assistant fails, forgets, or cannot answer.

## Persona Direction

Each avatar should eventually define:

- Character positioning.
- Speaking tone.
- Chinese expression style.
- Refusal and safety boundaries.
- Default voice.
- Default motion / reaction style.
- Memory strategy.

The goal is not only to switch 3D models. The goal is to switch companion personalities.

## Conversation Continuity

Phase 5 should improve:

- SQLite-backed session recovery after Phase 5.2 / 5.3.
- Context continuation.
- Regenerate / retry behavior.
- Clear context behavior.
- Clear memory behavior.
- Export memory behavior.
- Memory hit explanation.
- Failure messages that preserve companion tone.
- Pacing between thinking, speaking, and idle states.

## Voice / Motion / Emotion Link

The project should gradually connect:

- thinking -> thinking/listening motion
- speaking -> speaking motion + TTS/audio
- failure -> clear error feedback + recovery state
- memory hit -> subtle recognition feedback
- RAG hit -> source-aware response state
- workflow running -> tool/action state

This should be state linkage, not a rewrite of the animation system.

## Deferred Capabilities

These are optional enhancements, not Phase 5 mainline:

- Qdrant / embedding.
- Enterprise document Q&A.
- Large workflow automation.
- Multi-agent loops.
- Model fine-tuning.

## Phase 5 Delivery Order

1. Memory architecture design.
2. SQLite / local persistence minimum loop.
3. Short-term memory persistence.
4. Long-term memory extraction.
5. Avatar persona system.
6. Memory management UI and companion continuity.
7. Optional RAG / Qdrant / n8n enhancement evaluation.

## Phase 6 Preview

Before considering SFT / LoRA fine-tuning, the project should collect high-quality Chinese dialogue samples:

- Alice persona rules.
- Good answer / bad answer examples.
- Refusal boundary examples.
- Companion tone examples.
- Memory usage examples.

Prompt + persona + memory should be optimized first. Fine-tuning should only be evaluated after enough examples exist and the expected gain is clear.
