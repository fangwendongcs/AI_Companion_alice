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
  -> Mock / CosyVoice2 Local / Qwen3-TTS Remote / Fish Audio Remote / future self-hosted adapter
  -> unified Audio Result
```

Current Web Settings and public TTS readiness expose `mock`, `cosyvoice`, `qwen3_tts`, and `fish_audio`. Clients send only a public provider id plus `text`, `locale`, `emotion`, `tone`, `prosody`, and `stream`; provider-specific prompt, instruction, model, voice, endpoint, and secret handling stays inside the backend adapter. CosyVoice2 defaults to the official FastAPI runtime contract (`/inference_sft` by default). Qwen3-TTS uses Alibaba Cloud Model Studio / DashScope's native multimodal-generation API, while Fish Audio uses its native `/v1/tts` contract. Both remote adapters still require live acceptance.

Every registered provider result exposes safe normalized metadata for provider/model/voice/capabilities/sample rate/latency. An upstream streaming capability does not change the current client contract: Web still consumes a complete Audio Result and reuses the existing TTSService, AudioManager, LipSync, and Presentation lifecycle.

For long CosyVoice2 replies, Web `TTSService` may split the text into ordered segments and request the first short segment first. This lowers first-audio wait while keeping the same `/api/tts` Audio Result contract. It is not client PCM streaming; `streaming=false` still means the client receives each segment as a complete WAV/Base64 payload.

## Security Boundary

- Web and iOS do not store provider keys.
- Web and iOS do not call CosyVoice2 runtime, provider services, n8n, or future vector stores directly.
- Public deployment candidates must enable the Phase 4 security baseline: CORS allowlist, body limits, rate limits, API token auth for sensitive writes, upload isolation, request IDs, and redacted logs.
