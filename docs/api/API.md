# API Overview

Alice backend is the shared Web / iOS API boundary. Clients should call this backend instead of direct provider services, model endpoints, n8n webhooks, vector databases, or TTS engines.

For detailed request and response shapes, see [API_CONTRACT.md](./API_CONTRACT.md).

## Core Endpoints

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Local service health check. |
| `/api/providers` | `GET` | Safe readiness status for LLM and TTS providers. It must not expose keys, tokens, base URLs, or webhook secrets. |
| `/api/dialogue` | `POST` | Main dialogue and intelligence orchestration entry. It returns `dialogue.v1` reply text, companion state, affect, memory / RAG / workflow state, and renderer-agnostic avatar directives. |
| `/api/chat` | `POST` | Legacy chat compatibility endpoint. New clients should prefer `/api/dialogue`. |
| `/api/tts` | `POST` | Backend TTS provider boundary. New clients should request `responseFormat=json` and consume the unified Audio Result. |
| `/api/avatars` | `GET` | Public avatar registry read endpoint. |
| `/api/avatars` | `POST` | Protected avatar upload endpoint for local/private workflows. |
| `/api/memory` | `GET` / `DELETE` | Memory inspection and clearing boundary. |

## TTS Contract Direction

`/api/tts` now routes through the backend TTS provider registry:

```text
POST /api/tts
  -> TTSOrchestrator
  -> TTSProviderRegistry
  -> Mock / CosyVoice / Higgs / OpenAI / MiniMax provider
  -> unified Audio Result
```

Clients send semantic fields such as `text`, `voiceId`, `locale`, `emotion`, `tone`, `prosody`, and `stream`. Provider-specific prompt, instruction, inline token, model name, endpoint, and secret handling stays inside the backend adapter. CosyVoice2 defaults to the official FastAPI runtime contract (`/inference_sft` by default); `/v1/audio/speech` is only for an explicitly configured OpenAI-compatible proxy.

## Security Boundary

- Web and iOS do not store provider keys.
- Web and iOS do not call CosyVoice, Higgs, OpenAI, MiniMax, n8n, or future vector stores directly.
- Public deployment candidates must enable the Phase 4 security baseline: CORS allowlist, body limits, rate limits, API token auth for sensitive writes, upload isolation, request IDs, and redacted logs.
