"use client";

import { FormEvent, useState } from "react";

import type {
  ApiResult,
  CheckPriority,
  CheckStatus,
  RepositoryCheckReport,
} from "@/lib/github/types";

const statusMeta: Record<
  CheckStatus,
  { label: string; mark: string; className: string }
> = {
  pass: {
    label: "已确认",
    mark: "✓",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  fail: {
    label: "缺失",
    mark: "×",
    className: "border-rose-300 bg-rose-50 text-rose-800",
  },
  unknown: {
    label: "无法确认",
    mark: "?",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
};

const priorityMeta: Record<CheckPriority, { label: string; className: string }> = {
  high: { label: "优先补齐", className: "bg-[#e55e34] text-white" },
  medium: { label: "建议补齐", className: "bg-[#f2d36b] text-[#4c3b10]" },
  low: { label: "可选完善", className: "bg-[#dfe5df] text-[#425047]" },
};

type ErrorState = {
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function RepositoryChecker() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [report, setReport] = useState<RepositoryCheckReport | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch(
        `/api/github/check?url=${encodeURIComponent(repositoryUrl.trim())}`,
        { headers: { Accept: "application/json" } },
      );
      const result = (await response.json()) as ApiResult<RepositoryCheckReport>;
      if (!result.ok) {
        setError({ ...result.error, requestId: result.requestId });
        return;
      }
      setReport(result.data);
    } catch {
      setError({
        code: "CLIENT_REQUEST_FAILED",
        message: "无法连接检查服务，请确认本地服务正在运行。",
        retryable: true,
        requestId: "未生成",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2efe7] text-[#16241d]">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <header className="grid gap-8 border-b-2 border-[#16241d] pb-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
          <div>
            <div className="mb-6 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#b24b2a]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#e55e34] shadow-[0_0_0_5px_rgba(229,94,52,0.15)]" />
              HackKit / Repo Inspector 01
            </div>
            <h1 className="max-w-3xl text-balance font-serif text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              仓库说清楚了吗？
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#4d5b54] sm:text-lg">
              输入公开 GitHub 仓库。检查器只读取元数据与 README，
              用行号和原文摘录支撑每个结论。
            </p>
          </div>
          <div className="border-l-0 border-[#16241d] font-mono text-xs leading-6 text-[#5f6b65] lg:border-l lg:pl-8">
            <p>READ ONLY / PUBLIC REPOS</p>
            <p>RULE BASED / NO AI</p>
            <p>PASS · FAIL · UNKNOWN</p>
          </div>
        </header>

        <section className="py-10" aria-labelledby="checker-form-title">
          <h2 id="checker-form-title" className="sr-only">
            输入待检查仓库
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="group relative block">
              <span className="absolute left-5 top-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#748078]">
                GitHub repository URL
              </span>
              <input
                type="url"
                required
                spellCheck={false}
                autoComplete="url"
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                className="h-20 w-full border-2 border-[#16241d] bg-[#fffdf7] px-5 pb-2 pt-8 font-mono text-sm outline-none transition-shadow placeholder:text-[#9aa19c] focus:shadow-[6px_6px_0_#e55e34]"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-20 border-2 border-[#16241d] bg-[#16241d] px-8 font-mono text-sm font-bold uppercase tracking-[0.14em] text-[#fffdf7] transition hover:-translate-y-0.5 hover:bg-[#e55e34] disabled:cursor-wait disabled:opacity-60 md:min-w-44"
            >
              {pending ? "正在取证…" : "开始检查 →"}
            </button>
          </form>
          <p className="mt-3 font-mono text-xs text-[#6d7771]">
            仅接受 https://github.com/owner/repo；不读取私有仓库，不执行仓库内容。
          </p>
        </section>

        {error && (
          <section
            role="alert"
            className="mb-10 border-2 border-[#8f2f25] bg-[#fff2ec] p-6 shadow-[6px_6px_0_#8f2f25]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#8f2f25]">
                  {error.code}
                </p>
                <h2 className="mt-2 text-xl font-bold">没有完成这次检查</h2>
                <p className="mt-2 text-[#663b33]">{error.message}</p>
              </div>
              <span className="border border-[#8f2f25] px-3 py-1 font-mono text-xs text-[#8f2f25]">
                {error.retryable ? "可重试" : "请修正输入"}
              </span>
            </div>
            <p className="mt-5 font-mono text-[11px] text-[#8a625a]">
              Request ID: {error.requestId}
            </p>
          </section>
        )}

        {report && (
          <div className="animate-[fade-in_350ms_ease-out]">
            <section className="grid gap-px border-2 border-[#16241d] bg-[#16241d] lg:grid-cols-[1fr_auto]">
              <div className="bg-[#fffdf7] p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="bg-[#d7ff64] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                    Public repository
                  </span>
                  <span className="font-mono text-xs text-[#6d7771]">
                    updated {formatDate(report.repository.updatedAt)}
                  </span>
                </div>
                <a
                  href={report.repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block break-all font-serif text-3xl font-black underline decoration-[#e55e34] decoration-2 underline-offset-4 hover:text-[#b24b2a] sm:text-4xl"
                >
                  {report.repository.fullName}
                </a>
                <p className="mt-3 max-w-3xl leading-7 text-[#59645e]">
                  {report.repository.description || "仓库未填写描述。"}
                </p>
              </div>
              <div className="grid grid-cols-3 bg-[#fffdf7] lg:min-w-72">
                {(["pass", "fail", "unknown"] as const).map((status) => (
                  <div
                    key={status}
                    className="flex min-w-0 flex-col items-center justify-center border-r border-[#cad0c8] p-5 last:border-r-0"
                  >
                    <strong className="font-serif text-4xl">{report.totals[status]}</strong>
                    <span className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-[#67716b]">
                      {statusMeta[status].label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 border-2 border-[#16241d] bg-[#fffdf7] p-6 sm:p-8" aria-labelledby="missing-heading">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#89938d] pb-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#b24b2a]">
                    Action list / next moves
                  </p>
                  <h2 id="missing-heading" className="mt-1 font-serif text-3xl font-black">
                    你还缺什么
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#66716a]">{report.missing.length} 项待补齐</span>
              </div>

              {report.missing.length === 0 ? (
                <p className="mt-5 border border-emerald-300 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                  当前规则范围内没有发现缺失项。仍建议人工核对演示可用性、功能真实性和提交格式。
                </p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {report.missing.map((item) => {
                    const priority = priorityMeta[item.priority];
                    return (
                      <article key={item.id} className="border border-[#c2c8c2] bg-[#f6f3eb] p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-lg font-bold">{item.label}</h3>
                          <span className={`px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${priority.className}`}>
                            {priority.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#56615b]">{item.summary}</p>
                        {item.evidence.length > 0 && (
                          <p className="mt-2 font-mono text-[11px] text-[#68736d]">
                            已找到 {item.evidence.length} 条相关线索，但未达到该项最低证据要求。
                          </p>
                        )}
                        {item.suggestion && (
                          <p className="mt-3 border-t border-dashed border-[#c2c8c2] pt-3 text-sm leading-6 text-[#735140]">
                            <span className="mr-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#b24b2a]">
                              下一步
                            </span>
                            {item.suggestion}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
              <p className="mt-4 text-xs leading-5 text-[#68736d]">
                “缺失”表示规则没有在 README 中找到足够证据；“无法确认”不会被误算成缺失。
              </p>
            </section>

            <section className="mt-8 grid gap-5" aria-labelledby="result-heading">
              <div className="flex items-end justify-between border-b border-[#89938d] pb-3">
                <h2 id="result-heading" className="font-serif text-3xl font-black">
                  证据检查单
                </h2>
                <span className="hidden font-mono text-xs text-[#66716a] sm:block">
                  {report.checks.length} CHECKS / {formatDate(report.checkedAt)}
                </span>
              </div>

              {report.checks.map((check, index) => {
                const meta = statusMeta[check.status];
                return (
                  <article
                    key={check.id}
                    className="grid gap-5 border border-[#aeb6af] bg-[#fffdf7] p-5 transition hover:border-[#16241d] sm:grid-cols-[3rem_1fr] sm:p-6"
                  >
                    <div className="flex h-12 w-12 items-center justify-center border border-[#16241d] font-mono text-lg font-bold">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xl font-bold">{check.label}</h3>
                        <span
                          className={`inline-flex items-center gap-2 border px-3 py-1 font-mono text-xs font-bold ${meta.className}`}
                        >
                          <span aria-hidden>{meta.mark}</span> {meta.label}
                        </span>
                      </div>
                      <p className="mt-3 leading-6 text-[#56615b]">{check.summary}</p>

                      {check.evidence.length > 0 && (
                        <div className="mt-4 grid gap-2">
                          {check.evidence.map((evidence) => (
                            <blockquote
                              key={`${evidence.line}-${evidence.excerpt}`}
                              className="grid gap-2 border-l-2 border-[#e55e34] bg-[#f3f0e8] px-4 py-3 font-mono text-xs leading-5 text-[#46514b] sm:grid-cols-[4rem_1fr]"
                            >
                              <span className="font-bold text-[#b24b2a]">L{evidence.line}</span>
                              <span className="break-words">{evidence.excerpt}</span>
                            </blockquote>
                          ))}
                        </div>
                      )}

                      {check.suggestion && (
                        <p className="mt-4 border-t border-dashed border-[#c2c8c2] pt-3 text-sm leading-6 text-[#735140]">
                          <span className="mr-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#b24b2a]">
                            改进建议
                          </span>
                          {check.suggestion}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="mt-8 grid gap-px border-2 border-[#16241d] bg-[#16241d] sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["主语言", report.repository.language || "未标记"],
                ["许可证", report.repository.license || "未检测到"],
                ["默认分支", report.repository.defaultBranch],
                ["仓库活跃", `★ ${report.repository.stars}  ·  Fork ${report.repository.forks}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#d7ff64] p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#536329]">
                    {label}
                  </p>
                  <p className="mt-2 truncate font-mono text-sm font-bold">{value}</p>
                </div>
              ))}
            </section>

            <p className="mt-5 text-xs leading-5 text-[#68736d]">
              边界：结果来自规则匹配，只证明 README 中找到或未找到相关表述，
              不代表功能真实可用或项目质量已通过验收。
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
