import Link from "next/link";
import { ToolDirectory } from "@/components/shell/tool-directory";
import { availableToolCount, tools } from "@/lib/tools";

export default function Home() {
  return (
    <main>
      <section className="hero-section">
        <div className="shell-container hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">黑客松现场微工具</p>
            <h1 className="hero-title">
              <span>少切换。</span>
              <span>快解决。</span>
            </h1>
            <p className="hero-description">
              HackKit 把零散的现场任务拆成独立工具。选一个问题，完成一次真实输入与输出。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="#tools" className="primary-action focus-ring">浏览工具</Link>
              <Link href="/tools/repo-check" className="secondary-action focus-ring">检查公开仓库</Link>
            </div>
          </div>

          <aside className="readiness-panel" aria-label="工具箱当前状态">
            <div className="readiness-head">
              <span>当前可用</span>
              <strong>{availableToolCount.toString().padStart(2, "0")}</strong>
            </div>
            <div className="readiness-body">
              {tools
                .filter((tool) => tool.status === "available")
                .map((tool) => (
                  <Link key={tool.slug} href={tool.href ?? "/"} className="ready-row focus-ring">
                    <span>{tool.title}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
            </div>
            <p className="readiness-note">
              其余 {tools.length - availableToolCount} 项保留为路线图，不提供虚假入口。
            </p>
          </aside>
        </div>
      </section>

      <div className="shell-container">
        <ToolDirectory tools={tools} />
      </div>
    </main>
  );
}
