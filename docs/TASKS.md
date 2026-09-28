# 任务板

| ID | Owner | 状态 | 依赖 | Write set | 验收 |
| --- | --- | --- | --- | --- | --- |
| HK-000 | 总控 | done | 无 | 契约、集成、测试 | 基线、任务提示词、集成可恢复 |
| HK-101 | Shell 对话 | done | HK-000 | Shell write set | 首页和移动端外壳可用 |
| HK-102 | Card 对话 | done | HK-000 | Card write set | 输入、预览、PNG 下载闭环 |
| HK-103 | Repo 对话 | done | HK-000 | Repo write set | 公开仓库证据式检查闭环 |
| HK-104 | AI 对话 | done | HK-000 | AI write set | Key 仅服务端、缺失时安全降级 |
| HK-190 | 总控 | done | HK-101..104 | 集成与文档 | lint、build、浏览器验收、README |
| HK-200 | 总控 | done | HK-190 | 第二阶段契约、集成、测试 | 三个本地工具形成独立闭环并纳入目录 |
| HK-201 | 进度看板对话 | done | HK-190 | `src/app/tools/progress-board/**`、`src/lib/progress-board/**` | 本地多队倒计时、任务进度、持久化与 JSON 导入导出 |
| HK-202 | 现场破冰对话 | done | HK-190 | `src/app/tools/icebreaker/**`、`src/lib/icebreaker/**` | 公平配对、重复规避、奇数轮空、证据解释与本地历史 |
| HK-203 | 文档助手对话 | done | HK-190 | `src/app/tools/docs-assistant/**`、`src/lib/docs-assistant/**` | 基于真实输入生成两份 Markdown、缺失清单与下载闭环 |
| HK-204 | 总控 | done | HK-201..203 | 导航、公共文档、集成测试 | 审查三个提交，接入工具目录并完成浏览器验收 |
| HK-210 | 总控 | done | HK-204 | `docs/REQUIREMENTS.md`、`docs/ARCHITECTURE.md`、`docs/TASKS.md`、`PROGRESS.md`、`src/lib/contracts/local-tools.ts`、对应测试 | 固化本机演示身份、活动/参与者模型、权限、状态机、导入导出和三个独立任务写集 |
| HK-211 | 队友匹配对话 | done | HK-210 | `src/app/tools/team-match/**`、`src/lib/team-match/**`、对应私有测试 | 同一浏览器切换主持人/参与者，资料可见性、可追溯匹配、双向邀请状态机、退出/删除/恢复和幂等导入导出 |
| HK-212 | 投票墙对话 | done | HK-210 | `src/app/tools/vote-wall/**`、`src/lib/vote-wall/**`、对应私有测试 | 活动/作品闭环、资格锁定、同一参与者单票幂等、结果 hidden/live/final、主持人 void/导出和恢复 |
| HK-213 | 签到领取对话 | done | HK-210 | `src/app/tools/checkin-claim/**`、`src/lib/checkin-claim/**`、对应私有测试 | 名单/凭证校验、签到与领取分别去重、重复提示、异常记录、CSV 导出、退出/删除和恢复 |
| HK-214 | 总控 | done | HK-211..213 | 首页、工具目录、公共文档与全量验证 | 审查三个提交及修复，接入目录并完成桌面/窄屏浏览器验收 |

状态只能使用 `pending | in_progress | blocked | done`。任务对话完成时必须提交本地 commit，并回报 commit SHA、验证结果和未解决问题；总控以实际 diff 和测试为准。

## 正式版进度看板任务（设计已冻结，实施待授权）

| ID | Owner | 状态 | 依赖 | Write set | 验收 |
| --- | --- | --- | --- | --- | --- |
| HK-300 | 总控/公共后端任务 | in_progress | 正式版设计基线；用户授权托管运行方式 | 认证、数据库访问、公共服务端校验/类型、对应测试；具体路径开工前冻结 | 本地权限/错误/幂等基础、Supabase 服务端 REST 边界、scrypt 强哈希、注册/登录、session cookie、当前用户和退出撤销基础已通过测试；`0001/0002` 已应用，`0003` 待应用，尚未完成真实浏览器账号验收和看板 API |
| HK-301 | 进度看板服务端任务 | pending | HK-300 | 看板专用 service、Route Handler/Server Action、schema/迁移、附件 adapter 与测试 | 邀请加入、Team/Task CRUD、版本并发、轮询快照、附件授权、越权/重复/失败态和最小审计 |
| HK-301-UI | 进度看板页面任务 | pending | HK-301；前端风格参考 | 看板页面/私有组件/样式、客户端 API 调用和测试 | 两个独立浏览器、刷新/轮询、角色/冲突/网络/附件错误态可观察；不改公共导航与后端契约 |
| HK-301-QA | 总控 | pending | HK-300、HK-301、HK-301-UI；托管资源和测试账号单独授权 | 集成文档、任务板、进度投影及总控批准的修复 | 真实跨设备、越权、重复请求、附件、审计、服务失败态验收；证据齐全后才可标记正式版可用 |

任务卡、私有 write set 和执行顺序见 [`docs/formal-board/TASK_CARDS.md`](formal-board/TASK_CARDS.md)。推荐严格按 `HK-300 → HK-301 → HK-301-UI → HK-301-QA` 推进；队友匹配、投票和签到只复用经审查的公共契约，不得并发修改其公共文件。

## 第三阶段三个任务验收标准

### HK-211 队友匹配

1. 在同一浏览器创建 match 活动，显式切换 host 与两个 participant 身份；刷新后活动、资料、可见性和邀请仍恢复。
2. `public/limited/private` 的字段可见性真实生效；private 资料不进入匹配建议；建议逐条展示共同兴趣、互补技能、历史相遇/排除关系等证据，不能出现未填写属性。
3. 覆盖 `pending -> accepted/rejected/withdrawn/expired`；接收方不能替发送方撤回，发送方不能替接收方接受；同一 active pair 重复发送不产生第二条邀请。
4. 参与者退出后不再出现在新建议，pending 邀请取消，accepted match 变为 ended；删除资料清除展示字段但保留最小审计占位；删除前 JSON 可恢复。
5. 重复点击、重复 operationId、错误版本/工具/大小/引用和恶意文本均有可见错误且不部分写入；无联系人、无真实消息发送、无跨设备同步。

### HK-212 投票墙

1. host 创建活动、设置 `single-choice`、作品和资格规则，切换 participant 身份投票；刷新和 JSON 往返后仍保持状态。
2. active participant 才能投票；host 默认不可投票，只有 draft 阶段 `hostEligible` 明确打开才可；规则在 open 后锁定；viewer 不可投票；自投规则按 draft 设置执行。
3. 每个合资格身份每活动只能有一票；重复点击/重放返回已投提示且票数不变；活动 close 后作品、投票和结果不可变。
4. `hidden/live/final` 结果展示准确；host 可在 close 前带原因 void 投票，结果中区分有效/void；退出/删除后的历史票按契约保留并匿名化。
5. 不接受脚本/危险链接/超限导入，不导出凭证或密钥；导出明确标注本机演示和统计时间。

### HK-213 签到领取

1. host 创建 `check-in`、`claim` 或 `check-in-and-claim` 活动，建立名单并为每人核发可验证本地凭证；切换 participant 身份或输入凭证完成真实记录。
2. `(activityId, rosterEntryId, actionKind)` 各成功一次；重复提交只显示原记录时间和 `ALREADY_RECORDED`，不产生第二行；签到和领取在组合模式下彼此独立。
3. 覆盖未知/跨活动/已退出/未开放/格式错误/重复等异常记录；原始凭证不进日志和 CSV；host void 必须带原因且可审计。
4. 退出/删除后禁止新记录但保留已完成记录；CSV 列、UTF-8、公式前缀、逗号换行转义正确；刷新、导入导出和非法备份均可验证。
5. 页面明确本机演示边界，不宣称二维码安全、账号认证、跨设备共享或线上核验。
