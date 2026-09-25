# 任务板

| ID | Owner | 状态 | 依赖 | Write set | 验收 |
| --- | --- | --- | --- | --- | --- |
| HK-000 | 总控 | done | 无 | 契约、集成、测试 | 基线、任务提示词、集成可恢复 |
| HK-101 | Shell 对话 | done | HK-000 | Shell write set | 首页和移动端外壳可用 |
| HK-102 | Card 对话 | done | HK-000 | Card write set | 输入、预览、PNG 下载闭环 |
| HK-103 | Repo 对话 | done | HK-000 | Repo write set | 公开仓库证据式检查闭环 |
| HK-104 | AI 对话 | done | HK-000 | AI write set | Key 仅服务端、缺失时安全降级 |
| HK-190 | 总控 | done | HK-101..104 | 集成与文档 | lint、build、浏览器验收、README |

状态只能使用 `pending | in_progress | blocked | done`。任务对话完成时必须提交本地 commit，并回报 commit SHA、验证结果和未解决问题；总控以实际 diff 和测试为准。
