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
              面向社团招新面试的四个独立入口：看板、投票墙、GitHub 检查和项目文档。它们都能在本机直接打开，不需要按固定流程走。
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
              {`四项工具均为本地可用；正式看板和投票墙是本机单实例，不是公网协作。`}
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
