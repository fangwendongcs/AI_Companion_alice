# Archive

`archive/` 保存不再属于当前运行时主路径、但仍值得保留的历史材料。

```text
legacy-config/   旧角色配置；当前运行时已改用 public/avatars/
legacy-scripts/  一次性迁移/补丁脚本
source-assets/   原始模型、压缩包、贴图等素材池
unknown/         暂时无法确认用途、但不应留在根目录的内容
```

规则：

- 不要把新运行时代码依赖写到 `archive/`。
- 如果某份归档资产重新进入产品链路，应先迁回明确的正式目录，再更新引用。
- `unknown/` 中内容确认用途后，应移动到更准确的位置或清理。
