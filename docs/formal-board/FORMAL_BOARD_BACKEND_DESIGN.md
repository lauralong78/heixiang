# 正式版进度看板后端设计

状态：设计基线，未接入数据库、对象存储、Secret、部署或外部账号

适用范围：HK-300 / HK-301 以及后续正式版进度看板纵向闭环。本文只设计服务端边界，不把当前 `localStorage` 演示能力描述成线上能力。

## 1. 目标与最小技术边界

正式版要证明的闭环是：

```text
自建 ID/密码注册与登录
  -> 服务端 session cookie
  -> 创建活动并生成不可预测邀请凭证
  -> 成员加入并获得服务端角色
  -> 创建队伍、任务、附件并修改进度
  -> 另一独立浏览器刷新/轮询看到同一数据
  -> 重复、越权、过期和失败操作有可观察结果
```

推荐的最小方案：

| 边界 | 推荐 | 当前状态 |
| --- | --- | --- |
| 身份 | 自建唯一 ID + 密码；密码使用 Argon2id 或同等级强哈希，永不保存明文 | 设计中 |
| 会话 | 数据库保存不可逆 session token 摘要；浏览器使用 `HttpOnly`、`Secure`、`SameSite=Lax` cookie | 设计中 |
| 数据 | 关系型数据库；用外键、唯一约束和事务保证活动/成员/队伍/任务关系 | 未落地 |
| 文件 | 私有对象存储；数据库只保存元数据和对象键，下载由服务端授权后短时签发 | 未落地 |
| 同步 | 首次读取 + 版本号轮询，不使用 WebSocket；默认 5–10 秒，页面不可见时退避 | 未落地 |
| 入口 | Next.js Route Handler 或 Server Action 只作为薄入口，业务授权和事务放在服务端 domain/service 层 | 未落地 |

不推荐首版加入 OAuth、邮件找回、复杂实时订阅、公开活动搜索、在线协同编辑或队伍匹配。它们会扩大身份、隐私和并发边界，且不是正式看板的最小验收条件。

必须等用户明确选择并授权托管平台后，才能落地数据库实例、对象存储 bucket、Secret、域名、部署和付费服务。候选平台只能在授权后依据运行时兼容性、地区可达性、免费额度和数据删除能力重新核验；本设计不把某个平台写死，也不创建任何外部资源。

当前正式版与本机演示版并存：正式版页面使用服务端身份和数据；旧页面在没有后端接入前仍标为 `same-browser-demo`，不能共享角色或数据。

## 2. 数据模型与约束

所有实体使用不可预测的随机 ID（推荐 UUID/UUIDv7），时间统一 UTC。所有用户输入先做长度、枚举、归属和内容安全校验；客户端传来的角色、用户 ID、活动 ID、版本和文件 MIME 都不是可信依据。

### 2.1 核心实体

| 实体 | 关键字段 | 唯一约束 / 索引 | 外键与删除策略 |
| --- | --- | --- | --- |
| `User` | `id`, `loginId`, `passwordHash`, `status`, `createdAt`, `updatedAt`, `lastLoginAt` | `lower(loginId)` 唯一；`status` 为 `active/disabled/pending_delete` | 用户被禁用后拒绝新会话；删除采用受控匿名化/级联策略，不物理抹掉仍需审计的 actor ID |
| `Session` | `id`, `userId`, `tokenDigest`, `expiresAt`, `createdAt`, `lastSeenAt`, `revokedAt`, `ipHash`/`userAgentSummary`（可选） | `tokenDigest` 唯一；`userId + revokedAt` 索引 | `userId` 删除时撤销并删除 session；原始 cookie/token 不入库、不入审计 |
| `Activity` | `id`, `creatorId`, `slugOrCode`, `title`, `description`, `status`, `dataVersion`, `createdAt`, `updatedAt`, `closedAt` | `slugOrCode` 仅在需要展示时唯一；`creatorId + status` 索引 | 创建者删除/禁用不能绕过成员和审计处理；活动默认不在公开发现列表出现，业务数据按策略软删除/归档 |
| `Membership` | `id`, `activityId`, `userId`, `role`, `status`, `displayName`, `contactValueEncrypted`（可选）, `contactVisibility`, `joinedAt`, `updatedAt`, `leftAt` | `(activityId,userId)` 唯一；活动内 `role/status` 索引 | 成员退出为 `left`，历史任务/审计保留；删除活动时禁止悬空资源，按事务软删除或受控级联 |
| `Team` | `id`, `activityId`, `name`, `description`, `sortOrder`, `createdBy`, `createdAt`, `updatedAt`, `deletedAt` | `(activityId, normalizedName)` 唯一（含未删除记录） | 必须属于活动；删除为软删除，任务不可静默转移或悬空 |
| `Task` | `id`, `activityId`, `teamId`, `title`, `description`, `status`, `priority`, `progress`, `assigneeMembershipId`（可选）, `sortOrder`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt` | 活动内 task ID 唯一；`teamId`/assignee 索引 | 队伍删除前必须拒绝仍有任务或显式执行受审计的迁移；成员退出后保留历史 assignee 摘要，不允许借此越权 |
| `Attachment` | `id`, `activityId`, `teamId`（可选）, `taskId`（可选）, `uploadedBy`, `objectKey`, `originalName`, `mediaType`, `sizeBytes`, `sha256`, `status`, `createdAt`, `deletedAt` | `objectKey` 唯一；归属三选一且至少有 activity；活动/任务索引 | 删除先标记 `deleted` 再由受控清理任务回收对象；无授权下载；数据库删除不能先于对象回收确认 |
| `AuditEvent` | `id`, `activityId`（可选）, `actorUserId`（可选）, `action`, `targetType`, `targetId`, `requestId`, `result`, `createdAt`, `metadataJson`（白名单字段） | `requestId + action + actorUserId` 索引；时间和活动索引 | 审计 append-only；不存密码、session、联系方式明文、文件内容、完整邀请密钥或自由模型输出 |

`Membership` 是角色事实的唯一来源。首版角色固定为 `member`、`collaborator`、`host`；活动创建者在事务中生成 `host` 成员记录。`guest`/访客只代表未登录请求者，不是活动成员，也不拥有活动写权限。

联系方式默认不公开：保存时应加密或采用平台等价的机密字段保护；读取时只在“本人”或未来明确授权的业务场景返回。联系方式绝不进入 `AuditEvent` 的 `metadataJson`，也不写入普通错误、请求日志或导出文件。

邀请凭证必须是一次性或可撤销的高熵随机值。数据库只保存其摘要、活动、创建者、过期时间、最大使用次数和状态；完整邀请链接仅在创建时返回给创建者/主持人，日志和审计不保存完整链接或邀请码明文。

### 2.2 关系和事务规则

1. 任何 `Team`/`Task`/`Attachment` 都必须通过数据库外键归属一个 `Activity`；服务层还要检查请求用户对该活动的 Membership。
2. `Task.teamId`、`Attachment.taskId` 的活动必须与自身 `activityId` 相同；不能只凭客户端传来的两个 ID 更新跨活动资源。
3. 创建队伍用 `(activityId, normalizedName)` 唯一约束防重复；任务更新使用 `dataVersion` 或 `updatedAt` 的乐观并发条件，冲突返回 `CONFLICT`，不静默覆盖。
4. 业务写入、`dataVersion + 1` 和对应安全/业务审计必须在同一数据库事务内完成；审计失败时整个写入失败。
5. 删除是服务端命令，不接受直接 `DELETE` 作为通用 API。活动、队伍、任务、附件采用软删除或受控清理，避免审计中出现悬空目标。

## 3. 服务端权限矩阵

| 操作 | 访客 | 成员 | 协作者 | 主持人 |
| --- | --- | --- | --- | --- |
| 注册/登录 | 允许安全失败反馈 | 允许退出当前会话 | 允许退出当前会话 | 允许退出当前会话 |
| 通过邀请查看活动 | 仅能完成加入前的最小校验；不能读取完整活动数据 | 允许活动内读取 | 允许活动内读取 | 允许活动内读取 |
| 读取活动/队伍/任务 | 拒绝（除非未来明确公开只读活动） | 允许 | 允许 | 允许 |
| 修改自己的可选联系方式 | 拒绝 | 允许本人编辑/删除 | 允许本人编辑/删除 | 允许本人编辑/删除 |
| 创建/修改/删除队伍 | 拒绝 | 拒绝 | 允许活动内队伍管理 | 允许 |
| 创建/修改/删除任务 | 拒绝 | 仅允许产品明确的“本人任务更新”；首版默认拒绝结构性修改 | 允许 | 允许 |
| 修改任务进度/状态 | 拒绝 | 允许被分配任务的最小字段（若策略开启） | 允许活动内任务 | 允许 |
| 邀请/移除成员、改角色 | 拒绝 | 拒绝 | 拒绝 | 允许，且不能移除最后一个主持人 |
| 上传附件 | 拒绝 | 允许有权写入的任务/活动 | 允许 | 允许 |
| 下载附件 | 拒绝 | 允许活动内且资源可见 | 允许 | 允许 |
| 删除附件 | 拒绝 | 仅本人上传且资源写权限允许时；首版可收窄为协作者/主持人 | 允许 | 允许 |
| 查看审计 | 拒绝 | 拒绝 | 仅必要的活动操作摘要（首版可拒绝） | 允许活动审计摘要 |

实际首版可把成员任务更新再收窄为“只读成员、协作者/主持人写入”，先保证权限可验证。扩大成员写权限必须有独立需求、测试和审计字段，不由页面按钮默认放开。

## 4. 看板写操作的判定顺序

每个 Route Handler/Server Action 都必须重复执行以下顺序；不能因为页面已隐藏按钮、URL 带有角色或上一次请求通过就跳过：

1. 生成 `requestId`，限制 body 大小、解析格式、字段数量和超时。
2. 读取并验证 session cookie；查询 session 摘要、过期/撤销状态和当前 `User.status`。失败只返回不泄露账号存在性的安全错误。
3. 解析目标资源 ID，查询资源与活动归属；检查 `Activity.status` 是否允许此类写入，拒绝跨活动 ID 组合。
4. 查询当前用户的 `Membership`，由服务端得出 `member/collaborator/host`；绝不接受客户端 `role`/`actorUserId` 作为授权依据。
5. 按操作检查资源级权限、本人限制、邀请状态、附件大小/类型/归属和业务前置条件。
6. 在事务内重新读取并锁定或使用版本条件；检查唯一键、幂等键和状态机，写入业务表、递增 `dataVersion`，追加最小审计。
7. 返回统一 `ApiResult`，包含 `requestId`、安全错误码、用户可理解消息和 `retryable`。不回显 hash、token、联系方式、对象键或内部 SQL。

登录/注册安全事件、活动与成员/角色变更、队伍/任务创建修改删除、附件上传删除必须审计。普通读取、轮询、页面打开和下载成功本身不写业务审计；下载失败只进入受限应用日志，不记录文件内容。

## 5. API / Server Action 边界

首版推荐 Route Handler 承载认证、上传签名/下载授权和需要明确 HTTP 状态的接口；纯同源表单命令可使用 Server Action，但必须调用同一套 service 函数，不能把权限逻辑写在 action 文件里。

最小端点族（具体路径由实现任务冻结）：

| 能力 | 方法/形态 | 关键结果 |
| --- | --- | --- |
| 注册、登录、登出、当前用户 | `POST/GET /api/auth/*` | 安全错误；成功只返回最小用户摘要和 cookie 状态 |
| 创建/读取活动、加入/邀请 | `POST/GET /api/activities/*` | 活动摘要、成员角色、不可预测邀请的创建结果 |
| 队伍、任务 CRUD | `POST/PATCH/DELETE /api/activities/:id/...` | 版本号、变更摘要、冲突/重复错误 |
| 轮询 | `GET /api/activities/:id/board?version=n` | `304/unchanged` 或完整快照；不记录普通轮询审计 |
| 上传准备与完成 | `POST /attachments/prepare`, `POST /attachments/complete` | 服务端确认类型、大小、对象状态后才挂到业务资源 |
| 下载 | `GET /attachments/:id/download` | 先授权，再流式下载或短期授权 URL；不公开对象地址 |
| 审计摘要 | `GET /activities/:id/audit` | 仅主持人可见的白名单字段 |

所有写接口支持客户端 `operationId`（随机、长度受限）和服务端 `requestId`。`operationId` 仅在明确的业务作用域内唯一，例如 `(userId, activityId, operationId, action)`；相同参数重试返回原结果，不同参数复用同一 ID 返回 `IDEMPOTENCY_KEY_REUSED`。

## 6. 幂等、并发、轮询和错误态

- 创建队伍/任务使用幂等键 + 数据库唯一约束双保险；不能只靠前端去重。
- 修改任务携带 `expectedVersion`。版本不一致返回 `CONFLICT`，页面提示“数据已更新，请刷新后重试”，不能自动覆盖他人变更。
- 删除和附件完成操作也必须幂等：重复请求返回“已完成/已删除”的稳定结果，不新增审计噪声；参数改变则拒绝。
- 轮询以 `dataVersion` 或 ETag 为游标；无变化返回明确的 `unchanged`。网络失败显示“暂时无法同步，保留当前已知数据”，并采用退避重试；不能把旧数据标成最新。
- `401` 表示未登录/会话过期，页面引导重新登录；`403` 表示已登录但无权；`404` 对不应暴露存在性的资源可统一为 not found；`409` 表示版本/唯一键/幂等冲突；`413/415` 表示附件大小/类型；`429` 表示限流；`5xx` 表示服务端暂时失败并标注是否可重试。
- 轮询间隔不是安全机制；每次请求仍检查 session、成员和活动权限。页面隐藏数据不等于服务端不可读。

## 7. 附件最小安全边界

首版只允许明确的业务需要，例如 `image/png`、`image/jpeg`、`application/pdf`、`text/plain`；不允许 HTML、SVG、可执行文件、压缩包和未知双扩展名。单文件建议上限 10 MiB，活动总量和用户总量另设额度；确需调整必须在任务卡和验收中更新。

上传流程：服务端先鉴权和校验业务归属，再生成一次性对象键/上传意图；完成时重新校验实际字节数、允许类型、哈希和对象状态，病毒扫描/内容解析不可用时不能宣称已安全。对象存储必须私有，原始文件名只作为显示元数据并做字符清洗，不用于对象键。

下载流程：每次按 `Attachment -> Activity -> Membership -> resource permission` 授权；短时下载 URL 不可在普通响应之外泄露。删除先标记附件不可下载并写审计，再由受控清理任务删除对象；清理失败必须可重试并可观测，不影响授权判断。

最小威胁模型覆盖：伪造角色/活动 ID、越权跨活动读取、猜测邀请链接、重复提交、并发覆盖、CSRF、XSS/危险文件、超大文件/资源耗尽、对象 URL 泄露、日志泄密、成员退出后的残留访问。首版至少使用同源 cookie + CSRF 防护策略、速率限制、严格输出编码、响应安全头和不信任文件内容；不得执行上传内容或把其交给模型当指令。

## 8. 可观察验收标准

正式版不得以“本地命令成功”替代线上真实验收。总控须在授权的可访问环境使用两个独立浏览器配置/设备、两个真实测试账号完成：

1. 账号 A 创建活动并邀请 B；B 跨浏览器加入后能看到同一活动、队伍、任务和附件元数据。
2. A 刷新/轮询后看到 B 的合法变更；轮询无变化不重复追加数据，网络失败有明确恢复提示。
3. 成员尝试主持人操作、跨活动 ID、过期邀请、退出后读写和伪造 role 字段均被服务端拒绝；页面展示 `403/404` 对应的可理解错误。
4. 重复点击、超时重试、相同 `operationId` 不产生重复队伍/任务/附件/审计；同一 ID 改参数被拒绝。
5. 并发修改同一任务时，一方收到冲突而非静默覆盖；刷新后显示服务端最终版本。
6. 附件允许类型/大小可上传；越权下载、错误活动下载、危险类型、超限和删除后下载均失败；合法成员可在刷新后下载。
7. 审计能看到注册/登录安全事件、活动与成员/角色变更、队伍/任务 CRUD、附件上传/删除的 actor、时间、目标、结果和 requestId；看不到密码、session、联系方式明文或文件内容，也不会为普通轮询产生业务审计。
8. 数据库不可用、存储不可用、session 过期和限流时，页面有真实失败态，不显示“已保存/已上传”假成功。

本地单测、类型检查、构建和 Markdown 检查只能证明代码/文档层面；不能证明两个浏览器、托管数据库、私有对象存储、跨设备同步或线上权限隔离已经通过。

## 9. 未来复用边界

`User`、`Activity`、`Membership`、角色判定、session、审计、附件授权和错误契约可以被队友匹配、投票墙、签到领取复用。每个新工具仍须在服务端实现自己的业务唯一约束、状态机、敏感字段最小化和独立验收，不能通过复制本机 `identityId` 或页面角色完成迁移。
