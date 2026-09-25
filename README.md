# HackKit｜黑客松微工具箱

HackKit 把黑客松现场零散、高频的小任务做成可以独立打开的微工具。每个已上线工具都有自己的“输入 → 处理 → 结果或导出”闭环，不要求用户先登录或按固定流程操作。

## 第一阶段已完成

- **组队名片生成器**：填写称呼、角色、技能、兴趣和简介，实时预览并在浏览器本地导出 1200×675 PNG。
- **GitHub 提交检查器**：输入公开 `github.com/owner/repo`，检查 README 与比赛交付说明，输出 `pass / fail / unknown`、行号证据和建议。
- **工具目录**：支持关键词与分类筛选；未接通功能只显示路线图，不提供假入口。
- **DeepSeek 服务端适配口**：预留受控调用、超时、输入/输出边界和错误归一化；未配置 Key 时不影响基础工具。

## 本地运行

要求 Node.js 20.9+，推荐使用当前 LTS 或更新版本。

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000>。

生产验证：

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run start
```

## 环境变量

复制 `.env.example` 为 `.env.local`，只填写自己实际需要的服务端配置：

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
GITHUB_TOKEN=
```

- `DEEPSEEK_API_KEY` 可选；当前两个基础工具不依赖它。
- `GITHUB_TOKEN` 可选，只用于提高公开 GitHub API 的服务端速率限额。
- 变量都不能改成 `NEXT_PUBLIC_*`，也不能把真实值提交到仓库。

## 技术栈与结构

- Next.js App Router、React、TypeScript、Tailwind CSS。
- 名片在浏览器通过 Canvas 生成，不上传用户填写内容。
- GitHub 检查通过服务端 Route Handler 固定访问 `api.github.com`，不接受任意主机。
- DeepSeek 使用 OpenAI-compatible `/chat/completions` 接口；模型名、Base URL 和 Key 均从服务端环境读取。

项目契约位于：

- `docs/REQUIREMENTS.md`：产品与验收基线。
- `docs/ARCHITECTURE.md`：路由、API、密钥和 write set 契约。
- `docs/TASKS.md`：任务状态与所有者。
- `docs/HANDOFF_PROMPT.md`：新 Codex 对话必须获得的完整提示词模板。
- `PROGRESS.md`：可恢复的当前进度快照。

## 风险与处理

1. **GitHub 限流**：匿名 API 额度较低。接口把限流单独返回为可重试错误；部署时可在服务端配置受限 Token。
2. **规则误报或漏报**：README 检查是可解释的关键词规则，只证明文字证据是否存在，不证明代码真实可运行。
3. **密钥泄露与费用**：DeepSeek Key 仅在服务端读取，错误不会回显 Key 或上游正文；未来开放 AI 功能前仍需增加用户级限流和成本预算。
4. **字体差异**：PNG 使用浏览器/系统字体，不同平台字形可能略有区别，尺寸与内容结构保持一致。
5. **未上线状态**：本地构建成功不代表公开部署成功；部署需要单独授权并进行真实网络验证。

## AI 使用说明

本项目由参赛者独立负责产品选择和最终交付，使用 Codex 分任务实现与审查。多个 Codex 对话是 AI 协作方式，不代表多人开发。AI 参与了界面、名片导出、GitHub 规则和 DeepSeek 适配层的实现；总控对话负责共享契约、代码审查、集成和验证。

## 后续方向

1. **P0：上线并验证真实网络**——选择托管平台、配置服务端 Secret、检查网络与 GitHub 限流；成本主要是部署和回归测试。
2. **P1：队友匹配**——引入 Auth、数据库、RLS、邀请和双方同意后联系方式展示；隐私与权限成本较高。
3. **P2：投票、签到和多人看板**——增加活动空间、资格校验、重复操作约束与实时同步；需要数据库和多账号测试。

## 当前验证边界

第一阶段以本地运行和本地浏览器验收为准。尚未推送远端、公开部署或使用真实 DeepSeek Key；这些不是已完成事实。
