# 架构与共享契约

## 技术基线

- Next.js App Router、TypeScript、React、Tailwind CSS。
- 无账号工具优先在浏览器完成；需要密钥或跨域保护的能力进入 Route Handler。
- 共享类型位于 `src/lib/contracts/`；工具页面位于 `src/app/tools/<slug>/`；工具私有组件位于对应页面目录。

## 路由

| 路由 | 状态 | 说明 |
| --- | --- | --- |
| `/` | 第一阶段 | 工具目录与状态 |
| `/tools/card` | 第一阶段 | 组队名片生成与 PNG 导出 |
| `/tools/repo-check` | 第一阶段 | 公开 GitHub 仓库检查 |
| `/api/github/check` | 第一阶段 | GitHub 只读代理与规则检查 |

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

公共文件冲突由总控解决；功能任务不得越界修改其他任务写集。
