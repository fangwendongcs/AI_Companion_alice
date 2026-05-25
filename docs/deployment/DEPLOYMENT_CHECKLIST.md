# Deployment Checklist

This checklist is for preparing AI Companion Alice for a private preview or a public deployment candidate. It does not perform a real deployment.

## Before Deployment

- Confirm the latest local baseline passes:

```bash
npm run check
npm run smoke
npm run check:deployment-readiness
```

- Set `DEPLOYMENT_MODE`:
  - `local` for developer machines.
  - `demo` for controlled private previews.
  - `production` for public deployment candidates.

- Configure CORS:
  - Set `ALLOWED_ORIGINS` to the real preview or production domain.
  - Do not use localhost-only origins outside local mode.
  - Keep `CORS_ALLOW_LOCALHOST=false` for production unless there is a documented platform reason.

- Configure API auth:
  - Set `REQUIRE_API_AUTH=true` for demo and production.
  - Set `API_AUTH_TOKEN` through the platform secret manager.
  - Use `Authorization: Bearer <token>` or `X-API-Token` for protected write APIs.

- Configure request limits:
  - Keep `JSON_BODY_LIMIT` small enough for dialogue and TTS requests.
  - Keep `UPLOAD_BODY_LIMIT` and `AVATAR_UPLOAD_MAX_MB` aligned with platform limits.
  - Keep `RATE_LIMIT_ENABLED=true`.

- Configure upload storage:
  - Keep `UPLOAD_STORAGE_DIR` outside public static assets.
  - Keep `PUBLIC_ASSET_DIR` and `AVATAR_ASSET_DIR` explicit.
  - Treat uploaded files as untrusted until validated and reviewed.

- Configure providers:
  - Keep `stub` as the safe fallback mode.
  - Store real LLM / TTS provider keys only as backend environment variables.
  - Store n8n webhook URL and secret only as backend environment variables.

## What This Baseline Does Not Include

- User registration or login.
- OAuth / RBAC / multi-user sessions.
- Object storage isolation buckets.
- CDN isolation.
- WAF or platform abuse protection.
- Virus scanning.
- Sandbox parsing for uploaded 3D files.
- Full VRM schema validation.
- Content moderation.
- Multi-instance distributed rate limiting.
- External tracing such as Sentry or OpenTelemetry.
- Formal audit backend.

## Runtime Verification

After starting the service, verify:

- `GET /api/health` returns ok.
- `GET /api/providers` returns only non-secret readiness state.
- Protected write APIs reject missing or invalid tokens when auth is enabled.
- Smoke checks pass against the running service.
- Response headers include `X-Request-ID`.
- Logs do not include Authorization, cookie, API key, webhook secret, or full request body.
