# HK-311 正式投票墙 UI

状态：本地实现；依赖 HK-310 正式投票 API；未进行远端 migration、部署或真实双浏览器验收。

## 页面结构

- 未登录：只请求 `/api/formal-board/auth/me`，显示正式看板登录入口；不请求活动和 poll 数据。
- 登录后：读取 `/api/formal-board/activities`，成员在左侧选择活动；host 可在选中活动下创建 draft poll。
- snapshot：通过 `GET /api/formal-board/polls/:pollId` 读取 `poll/options/results/viewerVote`，候选项以作品纸片展示。
- host：仅当活动 API 的 `role` 为 `host` 时渲染控件；draft 可编辑设置、添加候选项、开放，open 可关闭；作废票必须填写 reason。
- 同步：选定活动和 poll 后首次读取，之后每 8 秒读取一次；请求序号和活动 ID 双重校验，旧响应不能覆盖新选择。

## 已实现状态

| 状态 | 页面表现 |
| --- | --- |
| 检查会话 / 活动 / snapshot 加载 | 明确的 loading 或同步中状态 |
| 未登录 / 会话失效 | 不读活动；引导到正式看板登录 |
| 无可见活动 | 左侧提示当前账号没有活动 |
| 无投票 ID | 不猜测 `activityId`，提示通过 `?pollId=` 或 host 创建后的 ID 进入 |
| 无候选项 | 空纸片状态，不生成假数据 |
| draft / open / closed | 文字状态 + 颜色；open/closed 的规则边界可见 |
| hidden / live / final | 只使用 API 返回的 `count`、`recordedForViewer`、`viewerVote`；`null` 不转成 0 |
| 已投 | 显示“已投/你的投票已记录”，不再提供第二次投票按钮 |
| FORBIDDEN / NOT_FOUND / CONFLICT | 解释权限、资源不存在或版本冲突，要求刷新/检查 ID |
| INTERNAL_ERROR / 503 | 显示“正式投票服务尚未启用 / 未应用数据库迁移”，不显示假数据 |
| 轮询失败 | 显示“同步失败 · 数据可能过期”，保留已确认 snapshot |

## poll ID 边界

当前冻结的 `GET /api/formal-board/activities` DTO 是活动列表，不含 `pollId`；冻结 API 也没有列出某活动投票的 GET endpoint。页面因此支持邀请链接 `?pollId=<poll UUID>`，并在 host 创建成功后使用服务端返回的 `poll.id` 回填。页面不会把活动 ID 当作 poll ID，也不会猜测或伪造 snapshot。若后端未来在 activity payload 中增加 `pollId` / `poll_id`，页面可直接使用该字段。

## 手工验收

1. 运行 `npm run dev`，打开 `/tools/formal-vote-wall`，确认未登录时只看到正式登录入口。
2. 登录后确认活动列表可见；未选择活动时不请求 poll snapshot。
3. 使用既有 session 和一个已知 poll UUID 只做 GET 验证：空候选项、hidden/live/final、无权限、404、503/未启用状态均应如实显示。
4. 若仅验证 UI 写路径，使用 mock 或测试环境；本次任务不点击创建、添加、投票、开放、关闭、作废按钮。
5. 检查桌面视口下键盘焦点、真实 label、`aria-live` 同步提示、禁用态和 reduced-motion。
6. HK-312 再做两个独立桌面浏览器、两个账号的真实成员/host、重复投票、冲突、刷新/轮询验收。

## Release gate

HK-312 真实验收前，migration 0019 未应用、后端请求 body 上限与并发相同 operationId 的稳定重放修复未确认；本页面不会绕过这些闸门，也不声称已完成真实多人能力。
