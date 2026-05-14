# API Contract

当前后端是本地开发代理服务，入口是 `backend/server.js`。

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

## 当前为什么没有一次性改完

前端已有代码依赖 `/api/avatars` 和上传接口的当前响应结构。为了不破坏现有功能，本轮只在文档中明确目标合约，并让 `ApiClient` 能兼容当前与未来两种格式。

TODO：

- 后端新增 `sendOk()` / `sendError()`。
- 前端上传逻辑迁移到 `ApiClient`。
- `/api/avatars` 保留兼容字段，同时增加 `{ ok, data }`。
