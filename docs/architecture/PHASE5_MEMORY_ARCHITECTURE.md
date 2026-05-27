# Phase 5 Memory Architecture

## Direction

Phase 5 is about companion memory, persona, and continuity. It is not a knowledge-base-first phase.

The current project already has short-term in-memory dialogue memory, local keyword RAG, n8n workflow boundary, and a minimal Agent pipeline. Those are useful baselines, but they do not yet create a persistent AI companion experience.

SQLite has not been integrated yet. Long-term Memory has not been implemented yet. Qdrant / embedding is deferred.

## Memory Types

| Memory Type | Purpose | Storage Direction | Notes |
| --- | --- | --- | --- |
| Short-term memory | Recent turns inside the current backend process | In-memory Map | Already exists; lost after restart. |
| Session memory | Conversation continuity for one session | SQLite in Phase 5.2 | Restores basic context after restart. |
| Long-term memory | Stable summaries and meaningful facts | SQLite summary tables in Phase 5.3 | Must be clearable and scoped. |
| Avatar memory | Persona-specific continuity | SQLite, scoped by avatarId | Alice / Shiro / Wambo should not share all memory by default. |
| User preference memory | Explicit preferences such as tone or interaction choices | SQLite user_settings | Should store settings, not raw private conversations. |

## What Goes Into SQLite

Phase 5.2 should start small:

- `sessions`: session id, avatar id, timestamps, mode.
- `memory_turns`: recent user / assistant turns, capped and clearable.
- `agent_events`: safe state transitions and tool/result metadata, not full secrets.
- `user_settings`: memory toggle, preferred avatar, voice choice, UI preferences.

Phase 5.3 can add:

- `memory_summaries`: user-approved or system-generated summaries.
- `avatar_memory`: persona-scoped summaries.

## What Stays In Memory

- Temporary request state.
- Current animation/audio/dialogue state.
- Pending workflow state.
- Transient debug events.
- Raw provider response objects that are not needed after response completion.

## What Should Not Be Stored

- API keys, tokens, webhook secrets, provider secrets.
- Full raw conversation history forever.
- Sensitive user input without a clear purpose.
- Uploaded private documents in public assets.
- Embeddings or vector database credentials in frontend storage.
- Debug logs containing Authorization, Cookie, request body, or secret-like fields.

## Privacy And Control

Memory must remain user-controllable:

- Memory can be enabled / disabled.
- Session memory can be cleared.
- Avatar-scoped memory can be cleared.
- Long-term summaries must be inspectable before becoming a product feature.
- Storage must be separated by `sessionId` and `avatarId`.

## Phase Boundaries

### Phase 5.1

Document memory architecture and data boundaries only. Do not write database code.

### Phase 5.2

Add the smallest SQLite persistence loop for sessions, turns, events, and settings.

### Phase 5.3

Add long-term memory summaries with clear and isolation behavior.

### Deferred

- Qdrant / embedding.
- Postgres.
- Automatic user profiling.
- Permanent raw transcript archive.
- Multi-user account system.
