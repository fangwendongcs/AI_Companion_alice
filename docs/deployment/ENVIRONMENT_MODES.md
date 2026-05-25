# Environment Modes

AI Companion Alice currently uses three deployment modes. The modes are intentionally simple: they help prevent unsafe defaults before public exposure, but they are not a full hosting or identity system.

## local

Use `DEPLOYMENT_MODE=local` for local development.

- Allows localhost / 127.0.0.1 origins.
- Keeps `REQUIRE_API_AUTH=false` by default so `npm run dev` and `npm run smoke` work without a token.
- Uses the `stub` LLM provider by default.
- Keeps uploads in local quarantine folders under `data/uploads/`.

This mode should not be exposed directly to the public internet.

## demo

Use `DEPLOYMENT_MODE=demo` for a controlled private preview.

Required baseline:

- Set `ALLOWED_ORIGINS` to the preview domain.
- Set `REQUIRE_API_AUTH=true`.
- Set a non-placeholder `API_AUTH_TOKEN` through the deployment platform secret manager.
- Keep `RATE_LIMIT_ENABLED=true`.
- Keep upload quarantine and public avatar assets separated.

Demo mode is suitable for limited private review. It is not a complete production security model.

## production

Use `DEPLOYMENT_MODE=production` only when the deployment environment has explicit security configuration.

Required by config validation:

- `ALLOWED_ORIGINS` must be set and must not be localhost-only.
- `REQUIRE_API_AUTH=true`.
- `API_AUTH_TOKEN` must be non-empty and non-placeholder.
- `RATE_LIMIT_ENABLED=true`.
- `UPLOAD_STORAGE_DIR`, `PUBLIC_ASSET_DIR`, and `AVATAR_ASSET_DIR` must be explicit.
- Upload quarantine must remain separate from public assets.

Production mode still does not include a full login system, OAuth, RBAC, WAF, object storage, CDN isolation, virus scanning, sandbox parsing, external observability, or multi-instance rate limiting.

## Secret Management

Never commit real secrets.

Keep these values only in local ignored files or deployment platform environment variables:

- `API_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `QWEN_API_KEY`
- `DEEPSEEK_API_KEY`
- `CUSTOM_API_KEY`
- `MINIMAX_API_KEY`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- future Qdrant or tracing credentials

`.env.example` must remain placeholder-only. `.env`, `.env.local`, logs, upload quarantine directories, and generated runtime artifacts must not be committed.

## Checks

Run before a private preview or public deployment candidate:

```bash
npm run check
npm run check:deployment-readiness
npm run smoke
```

For a production-mode dry run, run the readiness check with production-like environment variables from your shell or deployment platform. Do not put real secrets in the repository.
