# 任务板

| ID | Owner | 状态 | 依赖 | Write set | 验收 |
| --- | --- | --- | --- | --- | --- |
| HK-000 | 总控 | done | 无 | 契约、集成、测试 | 基线、任务提示词、集成可恢复 |
| HK-101 | Shell 对话 | done | HK-000 | Shell write set | 首页和移动端外壳可用 |
| HK-102 | Card 对话 | done | HK-000 | Card write set | 输入、预览、PNG 下载闭环 |
| HK-103 | Repo 对话 | done | HK-000 | Repo write set | 公开仓库证据式检查闭环 |
| HK-104 | AI 对话 | done | HK-000 | AI write set | Key 仅服务端、缺失时安全降级 |
| HK-190 | 总控 | done | HK-101..104 | 集成与文档 | lint、build、浏览器验收、README |
| HK-200 | 总控 | in_progress | HK-190 | 第二阶段契约、集成、测试 | 三个本地工具形成独立闭环并纳入目录 |
| HK-201 | 进度看板对话 | in_progress | HK-190 | `src/app/tools/progress-board/**`、`src/lib/progress-board/**` | 本地多队倒计时、任务进度、持久化与 JSON 导入导出 |
| HK-202 | 现场破冰对话 | in_progress | HK-190 | `src/app/tools/icebreaker/**`、`src/lib/icebreaker/**` | 公平配对、重复规避、奇数轮空、证据解释与本地历史 |
| HK-203 | 文档助手对话 | in_progress | HK-190 | `src/app/tools/docs-assistant/**`、`src/lib/docs-assistant/**` | 基于真实输入生成两份 Markdown、缺失清单与下载闭环 |
| HK-204 | 总控 | pending | HK-201..203 | 导航、公共文档、集成测试 | 审查三个提交，接入工具目录并完成浏览器验收 |
| HK-210 | 总控 | pending | HK-204 | 数据与权限契约 | 为匹配、投票和签到统一认证、数据模型与权限边界 |
| HK-211 | 队友匹配对话 | pending | HK-210 | 待 HK-210 固化 | 双向邀请、接受/拒绝、退出与删除资料 |
| HK-212 | 投票墙对话 | pending | HK-210 | 待 HK-210 固化 | 活动创建、作品提交、防重复投票与结果展示 |
| HK-213 | 签到领取对话 | pending | HK-210 | 待 HK-210 固化 | 可核验凭证、重复提示、记录与 CSV 导出 |

状态只能使用 `pending | in_progress | blocked | done`。任务对话完成时必须提交本地 commit，并回报 commit SHA、验证结果和未解决问题；总控以实际 diff 和测试为准。
