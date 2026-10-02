# 黑箱｜HackKit 招新演示版

这是面向社团招新面试的本地工具箱。它由四个可以独立打开的微工具组成，不要求访客先组队、开发、提交再展示，也不把任何一个工具伪装成公网服务。

## 快速开始

要求 Node.js 20.9+。

```bash
npm ci
npm run dev
```

浏览器访问：

- <http://localhost:3000/>：四工具目录
- <http://localhost:3000/tools/formal-board>：正式进度看板
- <http://localhost:3000/tools/formal-vote-wall>：正式投票墙
- <http://localhost:3000/tools/repo-check>：GitHub 仓库检查
- <http://localhost:3000/tools/docs-assistant>：项目文档助手

本地验证命令：

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## 四个真实闭环

| 工具 | 输入 → 处理 → 结果/导出 | 已知边界 |
| --- | --- | --- |
| 正式进度看板 | 自选 ID/密码 → 服务端 HttpOnly session 与权限检查 → 活动、队伍、任务、邀请的本机服务端数据 | 本机单实例；不是跨设备协作、公开互联网邀请或在线附件服务 |
| 正式投票墙 | 正式会话中的活动、成员、队伍候选 → 服务端校验并按会话单票去重 → 结果状态 | 本机单实例，不跨设备 |
| GitHub 仓库检查 | 公开 `github.com/owner/repo` URL → Route Handler 只读访问 GitHub → `pass/fail/unknown`、证据、限流和其他错误态 | 只接受公开仓库，不保证仓库代码实际可运行；可选 `GITHUB_TOKEN` 只放服务端 |
| 项目文档助手 | 用户输入项目名称、目标、功能等资料 → 本地规则整理并列出缺失项 → README 与一页说明，可编辑、复制、浏览器下载 Markdown | 当前不调用 AI 或网络；未来 AI 只能通过服务端 adapter，当前未开通 |

## 接口与数据边界

- GitHub 检查接口：`GET /api/github/check?url=...`。它只允许公开 `github.com` / `api.github.com` 只读访问，GitHub 内容属于不可信输入。
- 正式工具使用现有 `/api/formal-board/*` session/service 接口，仅用于本机服务。服务端负责 session、活动成员关系和资源权限；浏览器按钮、URL 或 localStorage 不是安全边界。
- 文档助手当前不需要 server API，也不上传用户输入。
- `GITHUB_TOKEN`（如配置）只能由服务端读取，用于提高公开 GitHub API 的速率限额；不展示、不索取明文。
- `DEEPSEEK_API_KEY` 没有配置也不影响本地基础能力。未来 DeepSeek 只能通过服务端适配层调用，本次演示未启用真实 AI。

正式工具的本机数据写入仓库忽略的本地存储文件；它不等于数据库，也不提供公网共享或安全备份。

## 为什么不部署

本版本服务于招新面试，目标是零成本、可复现的本机演示。当前没有创建云服务器、域名、数据库、对象存储、Secret、部署环境或外部账号，因此不能声称可公网访问，也没有推送或部署本项目。

如果未来部署，需要至少准备：

1. 持续运行的 Node 服务，以及可持久化的数据库或卷；本机 JSON 只支持单机实例。
2. HTTPS 域名、服务端 Secret，以及严格的 session、权限、CSRF、限流和错误恢复策略。
3. 若启用附件，需要私有对象存储、类型/大小限制和每次下载重新授权。
4. 真实的跨浏览器、跨设备、权限越界、并发、限流、恢复和数据备份测试。

这些资源和测试在本项目中都没有创建或宣称完成。

## 当前限制与路线图

已知限制：正式工具的本机服务只适用于同一台机器的演示；GitHub 检查只提供仓库文本与 API 证据；文档助手不会替用户补造事实；旧版工具路由仍保留，但不出现在本次四项目录或计数中。

未实现路线图：真实跨设备协作、线上队友匹配、线上投票、线上签到、持久化云数据库、受控 AI 建议、附件对象存储和公网部署。它们都不是当前可点击的功能，也没有对应线上链接。

项目基线与契约见 `docs/REQUIREMENTS.md`、`docs/ARCHITECTURE.md`、`docs/TASKS.md` 和 `PROGRESS.md`。
