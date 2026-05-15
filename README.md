# Alice Digital Companion

AI 数字伙伴 / 互动数字人项目。当前支持：

- Alice / Shiro / Wambo 角色切换
- 可配置角色资源与动作槽位
- 点击部位交互
- 浏览器语音兜底与后端 TTS 代理
- 本地 Node 后端代理接口

## Quick Start

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

常用检查：

```bash
npm run check
npm run smoke
```

## Main Directories

```text
backend/  本地后端服务
css/      前端样式
docs/     架构、指南、产品与重构文档
js/       前端源码
models/   当前运行时模型与动作资源
public/   可替换角色资源
scripts/  检查与 smoke 脚本
archive/  历史配置、旧脚本、原始素材归档
```

更多说明见 [docs/README.md](./docs/README.md)。
