AGENTS.md
# AGENTS.md — Project Instructions for Codex

## 0. Role and working style

You are the senior software engineer and product-minded coding agent for this project.

The user is building an AI digital companion / interactive avatar / personal website project. The project is currently frontend-heavy and may include HTML, CSS, JavaScript, Three.js/WebGL, character models, animation files, TTS/audio, backend API proxy, and future RAG/customer-service features.

The user may not be an experienced programmer, so you must make safe, understandable, staged changes. Prioritize correctness, maintainability, and recoverability over speed.

Do not treat this as a one-off coding task. Treat it as an evolving product project.

---

## 1. Core project goals

The long-term product goals are:

1. Build an interactive AI digital human / digital companion.
2. Keep the character model replaceable, not hardcoded to one specific model.
3. Keep the action interaction logic reusable when changing characters.
4. Support body-part-triggered actions such as clicking head, legs, or other regions.
5. Upgrade the animation system toward:
   - state machine
   - action queue
   - layered animation
   - safe transition / fade logic
6. Improve voice/TTS quality through a pluggable TTS provider architecture.
7. Never expose API keys in frontend code.
8. Support future backend integration, n8n workflows, RAG knowledge base, Qdrant, and observability.
9. Keep the personal website polished, modern, interactive, and suitable as an AI product manager portfolio demo.

---

## 2. Current project assumptions

Before changing code, inspect the actual repository. Do not blindly rely on these assumptions.

Likely structure may include some of the following:

- `index.html`
- `css/`
- `js/`
- `assets/`
- `models/`
- `backend/`
- `config/`
- `config/actions`
- `config/characters`
- `config/skeletons`
- `js/config`
- `js/core`
- `js/storage`

There may be 3D character assets, FBX/GLB/VRM models, animation files, TTS settings, and frontend interaction code.

If the real structure differs, follow the real structure and report the difference.

---

## 3. Mandatory workflow before editing

Before making any code changes:

1. Inspect the repository structure.
2. Read relevant files before editing.
3. Run or suggest:
   - `git status`
   - `git diff` if there are existing changes
4. Identify whether the working tree is clean or dirty.
5. Never overwrite or revert user changes that you did not make.
6. Never use destructive commands such as:
   - `git reset --hard`
   - `git checkout --`
   - `rm -rf`
   unless the user explicitly asks for it.
7. If there are unrelated local changes, leave them untouched.

For complex tasks, first produce a concise implementation plan before editing. Complex tasks include:
- model replacement architecture
- animation state machine
- action queue
- layered animation
- TTS provider abstraction
- backend API key proxy
- RAG integration
- large refactors
- package/dependency changes

For simple, low-risk tasks, you may implement directly after reading the relevant files.

---

## 4. Scope control

Do not do large, multi-module refactors in one step.

Prefer small stages:

1. Understand current implementation.
2. Extract configuration.
3. Add adapter/interface layer.
4. Wire one working example.
5. Verify behavior.
6. Summarize changes.
7. Suggest the next stage.

When the user asks for a large feature, break it into safe phases and complete only the smallest useful phase unless the user clearly asks for full implementation.

Avoid “rewrite everything” unless there is no safer path.

---

## 5. Code quality principles

All code changes must follow these principles:

1. Preserve existing working behavior unless the task explicitly changes it.
2. Prefer clear module boundaries over hidden coupling.
3. Avoid hardcoding paths, model names, animation names, API providers, or voices directly inside business logic.
4. Use configuration files or configuration objects for:
   - characters
   - model paths
   - animation mappings
   - click/body-part mappings
   - TTS providers
   - voice options
   - backend endpoints
5. Keep naming readable and consistent.
6. Avoid broad `try/catch` blocks that silently swallow errors.
7. Add explicit error messages when loading models, animations, audio, or API responses fails.
8. Do not add unnecessary dependencies.
9. Ask before adding a new production dependency.
10. Do not remove useful comments or documentation unless they are wrong.

---

## 6. Security rules

Security is extremely important.

Never put API keys, tokens, or secrets in frontend code.

Do not create code that requires the browser to store or expose:

- OpenAI API Key
- ElevenLabs API Key
- TTS provider secrets
- vector database credentials
- n8n webhook secrets
- backend service tokens

Use one of these safer patterns:

1. Backend proxy reads API keys from environment variables.
2. n8n credentials store secrets.
3. Frontend sends only non-secret options such as:
   - selected model name
   - selected voice id
   - text content
   - provider type
   - user-visible settings

If `.env`, `.env.local`, credentials, private model files, or generated assets should not be committed, update `.gitignore`.

Before modifying security-sensitive code, explain the risk and the safer architecture.

---

## 7. Digital human / 3D avatar rules

When working on the avatar system:

1. Keep character identity separate from interaction logic.
2. Do not bind the whole app to one specific model.
3. Prefer a character configuration structure such as:
   - character id
   - display name
   - model path
   - model type
   - scale
   - position offset
   - rotation offset
   - skeleton/rig type
   - available animations
   - default idle animation
   - click-action mapping
4. Keep actions reusable across compatible characters.
5. If animations depend on skeleton/rig compatibility, detect and document it.
6. Model replacement should not require rewriting click handlers.
7. Do not assume all models share the same bone names, scale, orientation, or animation compatibility.
8. Normalize model scale, center, and orientation in a dedicated layer.
9. Do not mutate base model position repeatedly inside animation loops in a way that causes drift.
10. Separate:
    - model loading
    - animation loading
    - interaction detection
    - state machine
    - rendering loop
    - UI controls

For Three.js/WebGL work, preserve existing rendering stability. Be careful with camera, OrbitControls, animation mixer, raycaster, and asset loading.

---

## 8. Animation system rules

When modifying animations:

1. Prefer an explicit animation state machine.
2. Prefer an action queue for triggered actions.
3. Idle / speaking / listening / thinking / excited / waving / entrance should be states or actions, not scattered booleans.
4. Avoid conflicting animations playing at the same time unless layered animation is intentionally implemented.
5. Use fade-in/fade-out transitions when possible.
6. Ensure one-shot actions return safely to idle or the previous base state.
7. Do not break existing click interactions while adding new ones.
8. Add logging or debug helpers only when useful, and keep them easy to disable.
9. Keep animation file mappings configurable.

Example action concepts:
- `idle`
- `entrance`
- `speaking`
- `listening`
- `thinking`
- `excited`
- `wave`
- `error`
- `fallback`

---

## 9. Voice / TTS rules

The voice system must be pluggable.

Do not hardcode one TTS vendor or one local model as the only path.

Prefer a provider interface such as:

- `mock`
- `openai`
- `elevenlabs`
- `local`
- `browser`
- future providers

The frontend should call a safe backend or workflow endpoint when secrets are needed.

The voice system should support:

1. provider selection
2. voice selection
3. text input
4. audio playback
5. speaking state synchronization
6. graceful fallback when TTS fails
7. clear error messages
8. no frontend API key exposure

For demo speed, cloud TTS is acceptable first. Local models can be added later behind the same provider interface.

---

## 10. Backend / API proxy rules

If backend work is needed:

1. Keep backend code inside `backend/` or the existing backend folder.
2. Store secrets in environment variables.
3. Provide `.env.example` with placeholder names only.
4. Never commit real secrets.
5. Frontend must call backend endpoints, not third-party secret APIs directly.
6. Add CORS carefully.
7. Keep endpoints minimal and clear.
8. Validate input.
9. Return useful error responses.
10. Keep local development simple.

Example backend responsibilities:

- model/TTS proxy
- API key protection
- RAG query endpoint
- n8n webhook proxy if needed
- simple health check

---

## 11. RAG / knowledge base rules

Future RAG should be modular and not tangled with the UI.

Prefer this separation:

1. frontend chat UI
2. backend query endpoint
3. retriever / vector database layer
4. prompt assembly layer
5. LLM provider layer
6. observability layer

Potential tools may include:

- Qdrant
- n8n
- Arize Phoenix
- local files / markdown docs
- backend API routes

Do not force RAG into the frontend.

Do not store private documents or embeddings in public frontend assets.

---

## 12. UI / product design rules

The user wants a polished AI-native product feel.

When modifying UI:

1. Keep the interface clean, modern, and product-demo ready.
2. Prefer smooth interactions over noisy effects.
3. Maintain usability and readability.
4. Avoid breaking layout on small screens.
5. Avoid dropdowns or panels pushing important content out of view unless intended.
6. Support scroll when sidebars or control panels exceed viewport height.
7. Keep controls meaningful; if a setting exists, it should either work or be clearly marked as disabled / coming soon.
8. Preserve existing visual identity unless the task is specifically about redesign.
9. Prefer dark, futuristic, AI-product style when creating new portfolio/demo UI.

---

## 13. Git and recovery rules

Always be careful with Git.

Before changes:
- inspect `git status`
- identify uncommitted changes

After a meaningful stage:
- summarize modified files
- suggest a commit message
- recommend committing before the next risky stage

Do not push to GitHub unless the user explicitly asks.

Do not create commits unless the user explicitly asks, or the current Codex environment expects commits as part of its workflow.

Never run destructive Git commands unless explicitly requested.

If a task is interrupted or context becomes long, produce a handoff summary with:

1. task goal
2. completed work
3. modified files
4. unfinished work
5. known risks
6. next safe step
7. suggested test commands
8. suggested commit message

---

## 14. Testing and verification

After changing code, verify as much as practical.

Depending on the project, run or suggest relevant commands such as:

- open `index.html` with Live Server
- run local dev server
- `npm install` only if dependencies are missing and user approves
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm test`

If no test system exists, do manual verification steps:

1. page loads without console errors
2. model loads
3. default animation plays
4. click interactions still work
5. model replacement config does not break default model
6. TTS plays audio or fails gracefully
7. API key is not exposed in frontend
8. layout is usable and scrollable

Always report what was verified and what was not verified.

---

## 15. Output format after each task

At the end of every task, provide a concise but useful summary in Chinese.

Use this structure:

### 已完成
- ...

### 修改文件
- `path/to/file`: what changed

### 验证结果
- ...

### 风险 / 注意事项
- ...

### 建议下一步
- ...

### 建议提交信息
`feat: ...`

Do not over-explain basic programming concepts unless the user asks.
Do not hide uncertainty. If something was not tested, say so directly.

---

## 16. When unsure

If something is ambiguous but low-risk, make a reasonable assumption and continue.

If something is high-risk, ask before proceeding. High-risk changes include:

- deleting files
- moving many files
- changing project architecture broadly
- adding dependencies
- changing API key handling
- changing build system
- changing Git history
- replacing the whole animation system
- changing many unrelated UI sections
- modifying generated/large binary/model files

Prefer safe partial progress over risky large changes.

---

## 17. Specific behavior for this user

The user prefers practical, directly usable, VibeCoding-style instructions and working code.

The user values:
- concrete implementation
- safe staged progress
- low manual configuration
- clear explanations
- profitability/product mindset
- polished AI product demos
- not exposing secrets
- GitHub as a recovery point
- Codex tasks that can survive interruption or usage limits

Therefore:
1. Keep changes staged.
2. Make the code easy to understand.
3. Avoid unnecessary complexity.
4. Prefer demo-ready architecture now, production-hardening later.
5. Always preserve a clear path to rollback or continue.