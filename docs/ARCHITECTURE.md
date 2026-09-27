# 架构与共享契约

## 技术基线

- Next.js App Router、TypeScript、React、Tailwind CSS。
- 无账号工具优先在浏览器完成；需要密钥或跨域保护的能力进入 Route Handler。GitHub 检查器默认读取 `api.github.com`，匿名 API 限流时可只读降级到同一公开仓库的 `github.com` 页面，且必须明确未确认的字段。
- 共享类型位于 `src/lib/contracts/`；工具页面位于 `src/app/tools/<slug>/`；工具私有组件位于对应页面目录。

## 路由

| 路由 | 状态 | 说明 |
| --- | --- | --- |
| `/` | 第一阶段 | 工具目录与状态 |
| `/tools/card` | 第一阶段 | 组队名片生成与 PNG 导出 |
| `/tools/repo-check` | 第一阶段 | 公开 GitHub 仓库检查 |
| `/api/github/check` | 第一阶段 | GitHub 只读代理与规则检查 |
| `/tools/progress-board` | 第二阶段 | 本地活动倒计时、多队任务进度与 JSON 备份 |
| `/tools/icebreaker` | 第二阶段 | 本地公平配对、轮空与历史轮次 |
| `/tools/docs-assistant` | 第二阶段 | README 与一页说明生成、编辑和 Markdown 下载 |
| `/tools/team-match` | 第三阶段 | 本机身份切换、可解释匹配与邀请状态 |
| `/tools/vote-wall` | 第三阶段 | 本机单选投票、结果模式与 void 审计 |
| `/tools/checkin-claim` | 第三阶段 | 本地凭证签到/领取、异常记录与 CSV 导出 |

## API 返回契约

所有业务 API 使用：

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; requestId: string };
```

检查项状态固定为 `pass | fail | unknown`。`unknown` 表示证据不足或上游不可用，不可折算为 `fail`。

## DeepSeek 接入口

- 仅在 `src/lib/ai/` 读取 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- 浏览器不得读取或回显 Key；不使用 `NEXT_PUBLIC_` 前缀。
- 默认能力必须有无 AI 降级；模型输出必须结构校验后才能展示。
- 允许的未来工具必须白名单、只读、限制次数与超时，不能执行任意 URL、shell 或数据库写入。

## 并行任务写集

- Shell：`src/app/page.tsx`、`src/app/layout.tsx`、`src/app/globals.css`、`src/components/shell/**`、`src/lib/tools.ts`。
- Card：`src/app/tools/card/**`、`src/lib/card/**`。
- Repo check：`src/app/tools/repo-check/**`、`src/app/api/github/check/**`、`src/lib/github/**`。
- AI contract：`src/lib/ai/**`、`.env.example`、对应测试。
- Progress board：`src/app/tools/progress-board/**`、`src/lib/progress-board/**`。
- Icebreaker：`src/app/tools/icebreaker/**`、`src/lib/icebreaker/**`。
- Docs assistant：`src/app/tools/docs-assistant/**`、`src/lib/docs-assistant/**`。

## 第三阶段共享契约（HK-210）

### 公共实现

- `src/lib/contracts/local-tools.ts` 是 HK-211..213 唯一共享契约入口，当前只包含无副作用的 TypeScript 类型、常量、生命周期/权限纯函数和本地导入 envelope 校验；不得在这里读 localStorage、访问网络、读取环境变量或放 UI 逻辑。
- envelope 固定为 `hackkit-local-tools` / `version: 1` / `mode: same-browser-demo`，工具值分别是 `team-match`、`vote-wall`、`checkin-claim`。工具私有 `data` 必须在各自 `src/lib/<tool>/` 中继续深度校验。
- 公共实体是 `LocalIdentity`、`LocalActivity`、`ActivityParticipant`、`LocalCommandMeta` 和 `LocalExportEnvelope<T>`。ID、canonical ISO 时间、数量、文本和 512 KB 文件限制由共享校验器执行；共享校验成功不代表工具业务数据可信。

### 身份、权限与状态机

- `LocalActivity.ownerIdentityId` 是主持人来源；只有 owner 可获得 `host`。活动参与记录产生 `participant/viewer`，退出或删除的参与记录不再获得业务写权限。当前所有检查都是本机演示的完整性/UX 约束，不是认证；未来接入真实服务端时必须在服务端重新认证和授权。
- 活动状态允许 `draft -> open -> paused -> open -> closed -> archived`，删除是到 `deleted` 的软删除；删除活动可由主持人恢复到 `draft` 或 `archived`。参与者状态允许 `active <-> withdrawn -> deleted`，删除后不可由普通 UI 恢复。
- `ROLE_PERMISSIONS` 只定义公共最小权限：主持人管理活动、参与者和记录；参与者管理自己并提交业务记录；观察者只读。具体工具还必须检查“是否本人”“是否当前活动”“活动是否允许写入”“业务唯一键是否已存在”。

### 本地持久化和数据恢复

- 各工具使用独立 localStorage key，推荐：`hackkit.team-match.v1`、`hackkit.vote-wall.v1`、`hackkit.checkin-claim.v1`；禁止共用一个可互相覆盖的 key。
- 每个工具的导入先检查文件大小、JSON、共享 envelope、工具版本和业务 payload，再一次性替换本地快照；失败不得部分写入。导出/恢复都应提供结果提示，不能把“JSON.parse 成功”当作业务恢复成功。
- same-browser-demo 的身份切换是显式 UI 状态；所有写命令接收 actor identity，而不是从页面按钮或 URL 推断。刷新恢复只证明当前浏览器 localStorage 可恢复，不证明多设备或多人同步。

### 第三阶段独立任务 write set

| 任务 | 页面与私有库（只允许修改） | 明确禁止 | 集成 owner |
| --- | --- | --- | --- |
| HK-211 | `src/app/tools/team-match/**`、`src/lib/team-match/**` | 不改首页、路由目录、全局样式、`src/lib/contracts/**`、其他工具 | HK-214/总控 |
| HK-212 | `src/app/tools/vote-wall/**`、`src/lib/vote-wall/**` | 不改首页、路由目录、全局样式、`src/lib/contracts/**`、其他工具 | HK-214/总控 |
| HK-213 | `src/app/tools/checkin-claim/**`、`src/lib/checkin-claim/**` | 不改首页、路由目录、全局样式、`src/lib/contracts/**`、其他工具 | HK-214/总控 |

三个任务可以并行，彼此没有共享可写文件；各自的单测放在私有 `src/lib/<tool>/*.test.ts`。若发现公共契约不足，任务必须停在说明/回报，不得自行扩张 write set；由总控另开契约变更。

### 第三阶段工具禁止添加的能力

第三阶段不添加数据库、API route、Server Action、真实登录、跨设备同步、邮件/短信邀请、真实 QR 安全凭证、线上部署或远程推送。若未来引入服务端，必须新增服务端认证、授权、并发唯一约束、审计和 CSRF/速率限制设计，不能把本机 demo 的 role 字段直接当安全边界。

公共文件冲突由总控解决；功能任务不得越界修改其他任务写集。
