# Phase 5 Memory Architecture

## Direction

Phase 5 is about companion memory, persona, and continuity. AI Companion Alice is not an enterprise knowledge-base Q&A system, so the next engineering line should not be Qdrant-first or RAG-first.

Current state:

- Phase 4 closed the self-hosting and deployment security baseline. It did not close database work.
- SQLite has not been integrated.
- Long-term Memory has not been implemented.
- Short-term Memory, local keyword RAG, n8n workflow boundary, and Agent pipeline already exist, but they are intelligence baselines, not the final companion memory system.
- RAG / Qdrant / embedding are deferred optional enhancements.

## Storage Direction

Memory should not become a pile of scattered files.

Primary storage direction:

```text
data/sqlite/alice.db
```

Supporting directories:

```text
data/uploads/     # upload quarantine and temporary asset intake
data/knowledge/   # optional local knowledge source, not the memory source of truth
data/exports/     # user-initiated memory/session exports
data/logs/        # local operational logs if needed
```

SQLite should be the source of truth for companion memory. Files should only support upload, knowledge source, export, or logging workflows.

## Memory Layers

| Layer | Purpose | Storage Direction | Notes |
| --- | --- | --- | --- |
| Raw Session | Traceable original session and message records | SQLite `sessions` + `messages` | Used for recovery, review, and controlled summarization. |
| Short-term Memory | Recent N turns for the current session | In memory now; SQLite in Phase 5.3 | Drives immediate context continuity. |
| Long-term Memory | Stable preferences, facts, goals, relationship facts, important events | SQLite `memory_items` | Only important content should be promoted. |
| Persona Memory | Character persona, tone, boundaries, interaction style | SQLite/config `avatar_personas` | Alice / Shiro / Wambo should feel different beyond model assets. |
| Memory Policy | Rules for write, update, forget, prohibited storage, privacy controls | SQLite/config `memory_settings` + policy docs | User control matters more than automatic hoarding. |

## Proposed SQLite Tables

### `sessions`

Tracks dialogue sessions.

Suggested fields:

- `id`
- `session_id`
- `avatar_id`
- `created_at`
- `updated_at`
- `title`
- `status`
- `memory_enabled`

### `messages`

Stores raw session messages for controlled recovery and summary generation.

Suggested fields:

- `id`
- `session_id`
- `avatar_id`
- `role`
- `content`
- `created_at`
- `provider`
- `model`
- `metadata_json`

Rules:

- Store only when memory is enabled or when the product explicitly needs session recovery.
- Do not store secrets.
- Avoid turning this into a permanent raw transcript archive.

### `memory_items`

Stores promoted long-term memory items.

Suggested fields:

- `id`
- `scope`
- `session_id`
- `avatar_id`
- `type`
- `content`
- `confidence`
- `source_message_ids`
- `created_at`
- `updated_at`
- `expires_at`
- `status`

Suggested `type` values:

- `preference`
- `fact`
- `goal`
- `relationship`
- `boundary`
- `event`
- `style`

Rules:

- Only important content should become a `memory_item`.
- Repeated memory should merge/update an existing item instead of growing forever.
- Memory should be scoped by session and avatar where appropriate.

### `memory_events`

Tracks memory lifecycle operations.

Suggested fields:

- `id`
- `memory_item_id`
- `session_id`
- `avatar_id`
- `event_type`
- `reason`
- `created_at`
- `metadata_json`

Example `event_type`:

- `created`
- `updated`
- `merged`
- `forgotten`
- `disabled`
- `exported`

### `avatar_personas`

Stores persona configuration or overrides.

Suggested fields:

- `id`
- `avatar_id`
- `name`
- `persona_prompt`
- `tone`
- `boundaries`
- `default_voice`
- `default_motion_style`
- `memory_strategy`
- `updated_at`

This table is for personality experience. It is not a replacement for avatar manifest files.

### `user_preferences`

Stores explicit user-facing preferences.

Suggested fields:

- `id`
- `session_id`
- `avatar_id`
- `key`
- `value`
- `created_at`
- `updated_at`

Examples:

- preferred avatar
- preferred voice
- memory enabled
- response style preference
- UI preference

### `memory_settings`

Stores memory policy and privacy controls.

Suggested fields:

- `id`
- `session_id`
- `avatar_id`
- `memory_enabled`
- `long_term_enabled`
- `raw_message_retention`
- `summary_retention`
- `allow_export`
- `updated_at`

## Write Strategy

1. All eligible dialogue messages first enter `messages`.
2. Only important content should be promoted to `memory_items`.
3. Do not store API keys, passwords, identity numbers, financial information, tokens, webhook secrets, or sensitive private data.
4. Duplicate memory should merge/update, not endlessly append.
5. Memory writes should be explainable through `memory_events`.
6. Long-term memory should be clearable by session and avatar.
7. Raw message retention should be capped or configurable before this becomes a product feature.

## PromptBuilder Order

Future `PromptBuilder` should assemble context in this order:

1. Avatar persona.
2. Dialogue rules and boundaries.
3. User long-term preferences.
4. Recent context from the current session.
5. Relevant long-term memory.
6. Current user input.

RAG passages and workflow results should remain optional context, not the center of the companion experience.

## User Controls

Required controls before memory becomes a real product capability:

- Memory on/off.
- Clear memory.
- Clear by session.
- Clear by avatar.
- Export memory.
- Privacy notice explaining what is stored and what is not.
- Visible separation between short-term context and long-term remembered facts.

## Phase Boundaries

### Phase 5.1

Memory architecture design only. No database code.

### Phase 5.2

SQLite / local persistence minimum loop:

- `sessions`
- `messages`
- `memory_events`
- `user_preferences`
- `memory_settings`

### Phase 5.3

Short-term memory persistence:

- restore recent session context after restart
- cap recent turns
- keep clear controls

### Phase 5.4

Long-term memory extraction:

- promote important content into `memory_items`
- summarize instead of saving everything forever
- merge/update duplicate memories

### Phase 5.5

Avatar persona system:

- Alice / Shiro / Wambo persona config
- tone, boundaries, default voice, default motion style
- persona-aware memory policy

### Phase 5.6

Memory management UI:

- memory toggle
- clear/export controls
- visible privacy wording

### Phase 5.7

Optional RAG / Qdrant / n8n enhancement evaluation. Not the current mainline.

## Deferred

- Qdrant / embedding.
- Postgres.
- Permanent raw transcript archive.
- Automatic user profiling.
- Multi-user account system.
- Fine-tuning.
