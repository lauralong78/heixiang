"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "./repository-checker.module.css";

import {
  parseRepositoryDraft,
  REPOSITORY_DRAFT_STORAGE_KEY,
  serializeRepositoryDraft,
} from "@/lib/github/local-draft";

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
    className: styles.statusPass,
  },
  fail: {
    label: "缺失",
    mark: "×",
    className: styles.statusFail,
  },
  unknown: {
    label: "无法确认",
    mark: "?",
    className: styles.statusUnknown,
  },
};

const priorityMeta: Record<CheckPriority, { label: string; className: string }> = {
  high: { label: "优先补齐", className: styles.priorityHigh },
  medium: { label: "建议补齐", className: styles.priorityMedium },
  low: { label: "可选完善", className: styles.priorityLow },
};

type ErrorState = {
  code: string;
  message: string;
  retryable: boolean;
  requestId: string;
};

function formatDate(value: string | null) {
  if (!value) return "未确认";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function recoveryHint(code: string): string {
  switch (code) {
    case "INVALID_GITHUB_URL":
      return "请改为不带查询参数、片段或登录信息的 https://github.com/owner/repo 地址。";
    case "REPOSITORY_NOT_FOUND":
    case "PRIVATE_REPOSITORY":
      return "请确认仓库公开、地址拼写正确，并在 GitHub 的无痕窗口中可以直接打开。";
    case "GITHUB_RATE_LIMITED":
      return "稍后再试；如果公开页面可访问，检查器会尝试使用公开页面降级读取。";
    case "README_UNAVAILABLE":
    case "GITHUB_PUBLIC_PAGE_UNAVAILABLE":
      return "稍后重试，或先打开仓库主页确认 GitHub 当前可访问。";
    case "GITHUB_TIMEOUT":
    case "GITHUB_UNAVAILABLE":
    case "GITHUB_UPSTREAM_ERROR":
    case "CLIENT_REQUEST_FAILED":
      return "确认本地服务和网络正常后重试；不要把 Token 粘贴到地址或表单中。";
    default:
      return "保留当前地址后重试；若仍失败，请记录 Request ID 交给维护者排查。";
  }
}

export function RepositoryChecker() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [report, setReport] = useState<RepositoryCheckReport | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingStage, setPendingStage] = useState("正在准备公开只读请求…");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(REPOSITORY_DRAFT_STORAGE_KEY);
        if (saved) {
          setRepositoryUrl(parseRepositoryDraft(saved));
          setDraftNotice("已恢复这台浏览器上次检查的仓库地址。");
        }
      } catch {
        try { window.localStorage.removeItem(REPOSITORY_DRAFT_STORAGE_KEY); } catch { /* storage unavailable */ }
        setDraftNotice("已有本地地址草稿损坏，已安全清除。");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const serialized = serializeRepositoryDraft(repositoryUrl);
      if (serialized) window.localStorage.setItem(REPOSITORY_DRAFT_STORAGE_KEY, serialized);
      else if (!repositoryUrl.trim()) window.localStorage.removeItem(REPOSITORY_DRAFT_STORAGE_KEY);
    } catch {
      queueMicrotask(() => setDraftNotice("浏览器无法保存仓库地址；本次检查仍可继续。"));
    }
  }, [repositoryUrl, hydrated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setPendingStage("正在校验仓库地址…");
    setError(null);
    setReport(null);

    try {
      setPendingStage("正在读取仓库元数据与 README…");
      const response = await fetch(
        `/api/github/check?url=${encodeURIComponent(repositoryUrl.trim())}`,
        { headers: { Accept: "application/json" } },
      );
      const result = (await response.json()) as ApiResult<RepositoryCheckReport>;
      if (!result.ok) {
        setError({ ...result.error, requestId: result.requestId });
        return;
      }
      setPendingStage("正在整理证据与缺项…");
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
    <main className={styles.page}>
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <header className="grid gap-8 border-b-2 border-[#171717] pb-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
          <div>
            <div className="mb-6 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#245ad8]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#df4b59] shadow-[0_0_0_5px_rgba(223,75,89,0.18)]" />
              黑箱 / 仓库检查 01
            </div>
            <h1 className="max-w-3xl text-balance font-sans text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-6xl">
              提交前，先看看仓库少了什么。
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#635b50] sm:text-lg">
              粘贴公开 GitHub 仓库地址。它只读取仓库信息和 README，
              并把找到的证据、缺项和无法确认的内容分开列出。
            </p>
          </div>
          <div className="border-l-0 border-[#171717] font-mono text-xs leading-6 text-[#635b50] lg:border-l lg:pl-8">
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
              <span className="absolute left-5 top-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#635b50]">
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
                className="h-20 w-full border-2 border-[#171717] bg-[#fffaf1] px-5 pb-2 pt-8 font-mono text-sm outline-none transition-shadow placeholder:text-[#766e62] focus:shadow-[6px_6px_0_#245ad8]"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-20 border-2 border-[#171717] bg-[#ffd735] px-8 font-mono text-sm font-bold uppercase tracking-[0.14em] text-[#171717] transition hover:-translate-y-0.5 hover:bg-[#ffbf00] hover:shadow-[4px_4px_0_#171717] active:translate-x-px active:translate-y-0.5 disabled:cursor-wait disabled:opacity-60 md:min-w-44"
            >
              {pending ? "正在取证…" : "开始检查 →"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-[#6d7771]">
            <p>仅接受 https://github.com/owner/repo；地址只保存在当前浏览器，不读取私有仓库。</p>
            {repositoryUrl && (
              <button
                type="button"
                className="underline decoration-[#245ad8] underline-offset-4 hover:text-[#245ad8]"
                onClick={() => {
                  setRepositoryUrl("");
                  setReport(null);
                  setError(null);
                  window.localStorage.removeItem(REPOSITORY_DRAFT_STORAGE_KEY);
                  setDraftNotice("已清除本机保存的仓库地址。");
                }}
              >
                移除本机草稿
              </button>
            )}
          </div>
          {draftNotice && <p className="mt-2 text-xs text-[#6d7771]" role="status">{draftNotice}</p>}
          {pending && (
            <div className={styles.progress} role="status" aria-live="polite">
              <div className={styles.progressHeader}>
                <span className={styles.progressKicker}>READ ONLY / LIVE CHECK</span>
                <strong className={styles.progressStage}>{pendingStage}</strong>
              </div>
              <p className={styles.progressCopy}>GitHub 响应可能需要几秒；完成前不会把等待状态显示为成功。</p>
              <div className={styles.progressTrack} aria-hidden="true"><i /></div>
            </div>
          )}
        </section>

        {error && (
          <section
            role="alert"
            className="mb-10 border-2 border-[#171717] bg-[#fffaf1] p-6 shadow-[6px_6px_0_#df4b59]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-[#df4b59]">
                  {error.code}
                </p>
                <h2 className="mt-2 text-xl font-bold">没有完成这次检查</h2>
            <p className="mt-2 text-[#635b50]">{error.message}</p>
            <p className={styles.recovery}><strong>可以这样恢复：</strong> {recoveryHint(error.code)}</p>
              </div>
              <span className="border-2 border-[#df4b59] px-3 py-1 font-mono text-xs text-[#df4b59]">
                {error.retryable ? "可重试" : "请修正输入"}
              </span>
            </div>
            <p className={`${styles.requestId} mt-5 font-mono text-[11px] text-[#635b50]`}>
              Request ID: {error.requestId}
            </p>
          </section>
        )}

        {report && (
          <div className="animate-[fade-in_350ms_ease-out]">
            <section className="grid gap-px border-2 border-[#171717] bg-[#171717] shadow-[7px_7px_0_#245ad8] lg:grid-cols-[1fr_auto]">
              <div className="bg-[#fffaf1] p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="border-2 border-[#171717] bg-[#bfe4ff] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                    Public repository
                  </span>
                  <span className="font-mono text-xs text-[#6d7771]">
                    {report.source === "public-page" ? "PUBLIC PAGE FALLBACK" : `updated ${formatDate(report.repository.updatedAt)}`}
                  </span>
                </div>
                <a
                  href={report.repository.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block break-all font-sans text-3xl font-black underline decoration-[#df4b59] decoration-2 underline-offset-4 hover:text-[#245ad8] sm:text-4xl"
                >
                  {report.repository.fullName}
                </a>
                <p className="mt-3 max-w-3xl leading-7 text-[#635b50]">
                  {report.repository.description || (report.source === "public-page" ? "GitHub API 被限流；当前仅从公开页面读取可验证信息。" : "仓库未填写描述。")}
                </p>
              </div>
              <div className="grid grid-cols-3 bg-[#fffaf1] lg:min-w-72">
                {(["pass", "fail", "unknown"] as const).map((status) => (
                  <div
                    key={status}
                    className="flex min-w-0 flex-col items-center justify-center border-r border-[#8a8173] p-5 last:border-r-0"
                  >
                    <strong className="font-sans text-4xl">{report.totals[status]}</strong>
                    <span className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-[#635b50]">
                      {statusMeta[status].label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 border-2 border-[#171717] bg-[#fffaf1] p-6 shadow-[6px_6px_0_#ff91b7] sm:p-8" aria-labelledby="missing-heading">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#8a8173] pb-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#245ad8]">
                    Action list / next moves
                  </p>
                  <h2 id="missing-heading" className="mt-1 font-sans text-3xl font-black">
                    你还缺什么
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#635b50]">{report.missing.length} 项待补齐</span>
              </div>

              {report.missing.length === 0 ? (
                <p className="mt-5 border-2 border-[#171717] bg-[#d9f3d5] p-4 text-sm leading-6 text-[#171717]">
                  当前规则范围内没有发现缺失项。仍建议人工核对演示可用性、功能真实性和提交格式。
                </p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {report.missing.map((item) => {
                    const priority = priorityMeta[item.priority];
                    return (
                      <article key={item.id} className="border-2 border-[#171717] bg-[#f4eddf] p-4 shadow-[4px_4px_0_#bfe4ff] sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-lg font-bold">{item.label}</h3>
                          <span className={`px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${priority.className}`}>
                            {priority.label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#635b50]">{item.summary}</p>
                        {item.evidence.length > 0 && (
                          <p className="mt-2 font-mono text-[11px] text-[#635b50]">
                            已找到 {item.evidence.length} 条相关线索，但未达到该项最低证据要求。
                          </p>
                        )}
                        {item.suggestion && (
                          <p className="mt-3 border-t border-dashed border-[#8a8173] pt-3 text-sm leading-6 text-[#635b50]">
                            <span className="mr-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#245ad8]">
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
              <p className="mt-4 text-xs leading-5 text-[#635b50]">
                “缺失”表示规则没有在 README 中找到足够证据；“无法确认”不会被误算成缺失。
              </p>
              {report.checks.some((check) => check.status === "unknown") && (
                <div className={styles.unknownPanel} aria-labelledby="unknown-heading">
                  <h3 id="unknown-heading">无法确认：证据不足，不判定为缺失</h3>
                  <p>这些项目没有被算入待补齐清单。通常是 README 缺失，或上游只返回了公开页面的部分信息。</p>
                  <ul className={styles.unknownList}>
                    {report.checks.filter((check) => check.status === "unknown").map((check) => (
                      <li key={check.id}><strong>{check.label}</strong><span>{check.summary}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="mt-8 grid gap-5" aria-labelledby="result-heading">
              <div className="flex items-end justify-between border-b-2 border-[#8a8173] pb-3">
                <h2 id="result-heading" className="font-sans text-3xl font-black">
                  证据检查单
                </h2>
                <span className="hidden font-mono text-xs text-[#635b50] sm:block">
                  {report.checks.length} CHECKS / {formatDate(report.checkedAt)}
                </span>
              </div>

              {report.groups.map((group) => (
                <div key={group.id} className="grid gap-3">
                  <div className="border-2 border-[#171717] bg-[#bfe4ff] p-4 shadow-[4px_4px_0_#245ad8]">
                    <h3 className="font-sans text-xl font-black">{group.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#635b50]">{group.description}</p>
                  </div>
                  {group.checks.map((check, index) => {
                    const meta = statusMeta[check.status];
                    return (
                      <article
                        key={check.id}
                        className="grid gap-5 border-2 border-[#171717] bg-[#fffaf1] p-5 shadow-[5px_5px_0_#bfe4ff] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#245ad8] sm:grid-cols-[3rem_1fr] sm:p-6"
                      >
                        <div className="flex h-12 w-12 items-center justify-center border-2 border-[#171717] bg-[#ffd735] font-mono text-lg font-bold">
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
                          <p className="mt-3 leading-6 text-[#635b50]">{check.summary}</p>

                          {check.evidence.length > 0 && (
                            <div className="mt-4 grid gap-2">
                              {check.evidence.map((evidence) => (
                                <blockquote
                                  key={`${evidence.line}-${evidence.excerpt}`}
                                  className="grid gap-2 border-2 border-[#171717] bg-[#f4eddf] px-4 py-3 font-mono text-xs leading-5 text-[#635b50] sm:grid-cols-[4rem_1fr]"
                                >
                                  <span className="font-bold text-[#245ad8]">L{evidence.line}</span>
                                  <span className="break-words">{evidence.excerpt}</span>
                                </blockquote>
                              ))}
                            </div>
                          )}

                          {check.suggestion && (
                            <p className="mt-4 border-t border-dashed border-[#8a8173] pt-3 text-sm leading-6 text-[#635b50]">
                              <span className="mr-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#245ad8]">
                                改进建议
                              </span>
                              {check.suggestion}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </section>

            <section className="mt-8 grid gap-px border-2 border-[#171717] bg-[#171717] shadow-[7px_7px_0_#ffd735] sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["主语言", report.repository.language || "未标记"],
                ["许可证", report.repository.license || "未检测到"],
                ["默认分支", report.repository.defaultBranch || "未确认"],
                ["仓库活跃", report.repository.stars === null || report.repository.forks === null ? "公开页面未确认" : `★ ${report.repository.stars}  ·  Fork ${report.repository.forks}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#ffd735] p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#635b50]">
                    {label}
                  </p>
                  <p className="mt-2 truncate font-mono text-sm font-bold">{value}</p>
                </div>
              ))}
            </section>

            <p className="mt-5 text-xs leading-5 text-[#635b50]">
              边界：结果来自 README 规则与 GitHub 公开元数据，只证明公开证据存在、缺失或无法确认；
              不代表功能真实可用、CI 已通过或项目质量已完成验收。
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
