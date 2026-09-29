# HK-310 正式投票墙后端

状态：本地代码、测试与迁移草案已完成；`0019_formal_vote_wall.sql` 未应用到任何远端数据库。

## 固定规则与数据契约

- 投票墙属于既有 `activities`，活动默认私有；读取和投票都重新检查当前 session 对应用户的 `memberships.status = active`。
- `polls.status` 为 `draft -> open -> closed`。`open` 后 `host_eligible`、`allow_self_vote` 和候选项不能修改；`closed` 后不再接受投票、作废或候选项修改。
- `choice_mode` 固定为 `single-choice`。`votes` 上有数据库唯一索引 `(poll_id, voter_user_id)`，且不会因 void 释放，因此作废后不能再次投票。
- `poll_options.status` 为 `published | withdrawn | removed`。候选项可关联一个活动 active member 的 `submitted_by`，服务端据此检查 self-vote。
- `result_mode` 为 `hidden | live | final`：hidden 只给当前用户的 `recordedForViewer`/`viewerVote`，不返回票数；live 对 active member 返回有效票数；final 仅 closed 后返回有效票数。
- host 默认不可投票，只有 draft 阶段设置 `hostEligible=true` 才可投票；self-vote 同样只由 draft 阶段规则决定。
- `void` 必须由 host 带非空 reason；只将票设为 `voided`，保留投票记录与审计，不物理删除。

## API

所有响应都是 `{ ok, data, requestId }` 或统一错误 envelope；客户端的 userId、role、票数均不可信。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/formal-board/polls` | host 创建 draft poll，body 含 `activityId,title,description,hostEligible,allowSelfVote,resultMode,operationId` |
| GET | `/api/formal-board/polls/:pollId` | active member 读取裁剪后的 snapshot |
| GET | `/api/formal-board/polls/:pollId/result` | active member 读取同一结果裁剪契约 |
| PATCH | `/api/formal-board/polls/:pollId` | host 修改 draft poll；传 `open:true` 从 draft 开放，或传 `close:true` 关闭 open poll；必须带 `expectedVersion,operationId` |
| POST | `/api/formal-board/polls/:pollId/options` | host 创建候选项 |
| PATCH | `/api/formal-board/polls/:pollId/options/:optionId` | host 在 draft 修改候选项/状态 |
| POST | `/api/formal-board/polls/:pollId/vote` | active member 单选投票；body `optionId,operationId` |
| POST | `/api/formal-board/polls/:pollId/void` | host 作废票；body `voteId,reason,operationId` |

snapshot 的 `data.snapshot` 包含 `poll`、`options`、`results`、`viewerVote`。`results[*].count` 在 hidden/未 closed 的 final 中为 `null`；UI 应使用 `recordedForViewer` 和 `viewerVote` 展示“已记录”，不能根据裸数据库字段推断权限。

## RPC 原子边界

`formal_create_poll`、`formal_create_poll_option`、`formal_update_poll`、`formal_update_poll_option`、`formal_cast_vote`、`formal_void_vote` 均在数据库事务内重新检查 membership/host、资源归属、状态、版本、唯一性，写入业务表、`idempotency_records` 和关键 `audit_events`。读取走 `formal_get_poll_snapshot` / `formal_get_poll_result`，只返回 active member 可见的数据。

审计 action 白名单仅为 `poll.create`、`poll.update`、`poll.close`、`poll.option.create`、`poll.option.update`、`vote.cast`、`vote.void`。普通读取、轮询、session、密码、联系方式和票数查看不会创建审计事件；void reason 作为必要的业务审计字段保存，不记录凭证或 session。

## 幂等与错误

每个写请求都要求 8–96 位 `operationId`。同一 actor/activity/action 下相同 operationId 与 fingerprint 返回原结果；换参数返回 `IDEMPOTENCY_KEY_REUSED`。投票即使换 operationId 重试，也受 `(poll_id,voter_user_id)` 数据库唯一约束保护，并返回 `ALREADY_VOTED`。

主要错误：`401 UNAUTHENTICATED`、`403 FORBIDDEN`、`404 NOT_FOUND`、`409 CONFLICT`/`IDEMPOTENCY_KEY_REUSED`、`400 INVALID_INPUT`。服务端 SQL、hash、session、联系方式和内部凭证不进入响应。

## 验收与边界

本地测试覆盖输入约束、hidden/live/final SQL 裁剪断言、draft/version/close、operationId 决策、数据库唯一约束、选项状态、void reason 与审计 action。`lint`、TypeScript、unit test、build 和 `git diff --check` 只证明本地代码/文档层，不证明托管数据库已应用、真实双浏览器、跨账号或线上部署。

本任务没有执行：migration apply/push、远端表或函数、真实账号/活动/投票、部署、远程推送。HK-311 页面只应依赖上述 API DTO，并显示明确的 sync/result/permission/conflict 状态。
