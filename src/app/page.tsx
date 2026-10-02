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
              <span>黑箱，</span>
              <span>现场工具。</span>
            </h1>
            <p className="hero-description">
              给参加黑客松的小伙伴准备的独立微工具箱：协作推进、组织投票、检查公开 GitHub 仓库，也能整理交付文档。每个工具都能各自打开，按需要组合使用，不需要按固定流程走。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="#tools" className="primary-action focus-ring">查看全部工具</Link>
              <Link href="/tools/formal-board" className="secondary-action focus-ring">打开正式看板</Link>
            </div>
          </div>

          <aside className="readiness-panel" aria-label="工具箱当前状态">
            <div className="readiness-head">
              <span>当前可用</span>
              <strong>{availableToolCount.toString().padStart(2, "0")}</strong>
            </div>
            <div className="readiness-body">
              {tools.map((tool) => (
                  <Link key={tool.slug} href={tool.href ?? "/"} className="ready-row focus-ring">
                    <span>{tool.title}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
            </div>
            <p className="readiness-note">
              {`四个入口分别覆盖协作推进、组织投票、公开仓库检查和交付文档整理。`}
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
