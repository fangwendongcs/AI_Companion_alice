# Avatar Meta Deprecation Plan

日期：2026-05-15  
范围：`meta.json` legacy fallback 与 `CharacterManager.loadMeta()`

## 当前状态

- 新角色主配置文件已经统一为 `manifest.json`。
- 新上传角色只会生成 `manifest.json`。
- `meta.json` 仅保留给历史 registry 条目 fallback。
- `CharacterManager.loadMeta()` 仅作为兼容别名，内部已经转发到 `loadManifest()`。

## 废弃窗口

```text
deprecatedSince: 2026-05-15
supportedThrough: 2026-08-15
removeOnOrAfter: 2026-08-16
```

在 `2026-08-15` 及以前：

- 允许历史 registry 条目继续只声明 `meta`。
- 运行时如果 manifest 不存在，会回退读取 `meta.json`。
- `loadMeta()` 继续可用，但不再允许新增调用。
- `manifest + meta` 双轨条目不再允许；新条目只能是 `manifest`，旧条目只能是 `meta` fallback。

从 `2026-08-16` 起，满足以下条件后可删除兼容层：

1. 生产 `public/avatars/registry.json` 中所有角色都只使用 `manifest`。
2. 新上传流程已经稳定只生成 `manifest.json`。
3. `npm run check:legacy-avatar` 仍通过，证明旧路径曾被覆盖并可安全移除。
4. 项目外部没有仍依赖 `meta.json` 的导入脚本或文档流程。

## 删除步骤

1. 删除 `CharacterManager.loadMeta()`。
2. 删除 `ResourceResolver.resolveLegacyAvatarMetaPath()`。
3. 删除 registry 对 `meta` 字段的兼容校验。
4. 删除生产角色目录中的旧 `meta.json` 文件。
5. 删除 legacy fixture 和 `check:legacy-avatar`，或把它改成“禁止生产 registry 再出现 `meta`”的迁移完成检查。
6. 更新文档，移除所有 legacy fallback 描述。

## 当前回归保障

- `tests/fixtures/avatars/legacy-meta-only/` 保留一个只含 `meta` 的历史角色样例。
- `npm run check:legacy-avatar` 会验证：
  - 先尝试 `manifest.json`
  - manifest 不存在时才回退到 `meta.json`
  - fallback 读取到的角色配置仍然能通过 manifest schema 校验
- `npm run check:config` 会：
  - 拒绝新的 `manifest + meta` 双轨 registry 条目
  - 对尚未迁移的 `meta`-only 历史条目给出截止日期提示
