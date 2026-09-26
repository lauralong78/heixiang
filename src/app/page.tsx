import Link from "next/link";
import { ToolDirectory } from "@/components/shell/tool-directory";
import { availableToolCount, tools } from "@/lib/tools";

export default function Home() {
  return (
    <main>
      <section className="hero-section">
        <div className="shell-container hero-grid">
          <div className="hero-copy">
            <h1 className="hero-title">
              <span>黑客松现场，</span>
              <span>用得到的工具。</span>
            </h1>
            <p className="hero-description">
              做名片、查仓库、盯进度、现场配对，或者整理 README。每个工具都能单独使用，不用登录，也不用按固定流程走。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="#tools" className="primary-action focus-ring">查看全部工具</Link>
              <Link href="/tools/repo-check" className="secondary-action focus-ring">检查 GitHub 仓库</Link>
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
              另外 {tools.length - availableToolCount} 项还在计划中，暂时不能打开。
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
