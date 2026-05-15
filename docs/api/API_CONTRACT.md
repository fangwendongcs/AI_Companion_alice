# API Contract

当前后端是本地开发代理服务，入口是 `backend/server.js`，具体接口已拆到 `backend/routes/*`。

## 当前接口

### GET /api/health

```json
{ "ok": true }
```

### GET /api/avatars

当前返回 registry 原始结构：

```json
{
  "defaultAvatarId": "alice",
  "avatars": []
}
```

### POST /api/avatars

上传角色资源，成功返回：

```json
{
  "avatar": {},
  "registry": {}
}
```

### POST /api/chat

通过后端环境变量代理 LLM 请求，成功返回：

```json
{ "reply": "..." }
```

### POST /api/tts

返回音频二进制。

## 目标返回格式

后续建议逐步迁移为：

成功：

```json
{
  "ok": true,
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## 兼容迁移期

前端已有代码依赖 `/api/avatars` 和上传接口的当前响应结构。为了不破坏现有功能，当前处于兼容迁移期：

- 后端保留旧响应结构，例如 `/api/avatars` 仍返回 registry 原始对象。
- `backend/utils/response.js` 已提供 `sendOk()` / `sendError()`，后续新接口可以直接返回 `{ ok, data, error }`。
- 前端 `ApiClient.normalizeApiResponse()` 同时兼容三类结构：
  - 旧格式：数组或普通对象会原样返回。
  - 新成功格式：`{ ok: true, data }` 会解包成 `data`。
  - 新失败格式：`{ ok: false, error }` 会转换成 `AppError`。

因此后续可以逐个接口迁移，不需要一次性重写所有调用点。

TODO：

- 新接口优先使用 `{ ok, data, error }`。
- 旧接口迁移时先确认前端调用方已经通过 `ApiClient` 访问。
- `/api/avatars` 可在后续版本增加 `{ ok, data }` 包装，同时保留兼容读取逻辑。
- 文件上传接口如果部署公网，需要增加鉴权、速率限制、大小限制策略和安全扫描。
