# 正式版看板本地服务端配置

默认模式是零成本的“本机单实例”：除非显式设置 `FORMAL_BOARD_STORAGE_MODE=supabase`，Next.js 服务端都会将账号、session、活动、成员、队伍、任务、投票和审计元数据保存到 `data/formal-board/local-store.json`。这不是跨设备协作、公开互联网邀请或线上安全承诺；服务端仍使用 HttpOnly session cookie 和服务端权限检查。

## 本地配置

在仓库根目录创建未提交的 `.env.local`，只在本机填写：

```text
SUPABASE_URL=https://<你的项目引用>.supabase.co
SUPABASE_SECRET_KEY=<Supabase 项目 API 页里的 Secret key>
```

`SUPABASE_SECRET_KEY` 是服务端高权限凭证：不能放到 `NEXT_PUBLIC_*`、浏览器代码、截图、日志、提交或聊天中。不要把它发给赤玉；你只需在自己的电脑本地填写。仓库仍兼容旧变量名 `SUPABASE_SERVICE_ROLE_KEY`，但新项目优先使用 `SUPABASE_SECRET_KEY`。

服务端模块会拒绝非 HTTPS 地址和无效表名；错误信息不会回显密钥。浏览器不能直接调用这层，Route Handler 会在服务端完成 session、Membership 权限和审计。

模式选择是明确的：默认始终使用本地模式，即使 `.env.local` 中存在 Supabase 配置。只有显式设置非敏感变量 `FORMAL_BOARD_STORAGE_MODE=supabase` 才使用 Supabase；此时必须同时提供 `SUPABASE_URL` 与 `SUPABASE_SECRET_KEY`（兼容旧的 `SUPABASE_SERVICE_ROLE_KEY`）。显式 cloud mode 缺少配置会返回清晰配置错误，不会退回 local；配置完整但网络不可达时也不会静默切换到本地账户，而是返回数据库不可用错误。

## 本地演示

1. 不设置 `FORMAL_BOARD_STORAGE_MODE=supabase`，在仓库根目录运行 `npm run dev`；即使本机 `.env.local` 留有 Supabase 配置，也仍使用本地模式。
2. 打开 `http://localhost:3000/tools/formal-board`，注册自选 ID/密码并登录。
3. 创建活动、队伍和任务；刷新页面确认仍能恢复。
4. 从主持人界面生成邀请，在同一台电脑的另一个浏览器 profile 注册另一个账号并打开邀请链接；服务端会按 Membership 检查访问权限。
5. 打开 `/tools/formal-vote-wall`，由主持人创建 draft、添加候选项、开放投票；成员投票，重复投票只返回已投状态。
6. 退出后访问任一正式 API，应得到 `401 UNAUTHENTICATED`。本地数据文件属于开发数据，不要提交或公开。

附件对象存储未获授权时，页面只允许校验文件元数据并明确返回“未上传”；不会伪装上传成功。

## 已实现边界

- `supabase-rest.ts`：仅服务端使用的 Supabase REST 请求边界，默认 `cache: no-store`。
- `password.ts`：Node `scrypt` 强哈希与 timing-safe 校验；数据库只保存编码后的哈希，不保存明文。
- `session.ts`：高熵 session token、SHA-256 digest 和 HttpOnly cookie 选项。下一步才会把 digest 写入 `app_sessions`。

## 验收边界

本地可验证模块单测、类型检查、注册/登录/session、活动/队伍/任务、投票墙幂等和越权错误态。尚未验证 Supabase 线上部署、跨设备线上协作、私有对象存储和真实公网邀请；这些不能由本地 HTTP 200 或构建通过替代。
