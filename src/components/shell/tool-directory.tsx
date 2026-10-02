"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toolCategories, type HackKitTool, type ToolCategoryFilter } from "@/lib/tools";

type ToolDirectoryProps = { tools: HackKitTool[] };

function ToolCard({ tool, index }: { tool: HackKitTool; index: number }) {
  const content = (
    <>
      <div className="tool-card-topline">
        <span className="tool-category">{tool.category}</span>
        <span className="status-live">本地可用</span>
      </div>
      <div className="tool-card-copy">
        <h3>{tool.title}</h3>
        <p>{tool.description}</p>
        <p className="tool-boundary"><strong>边界</strong>{tool.boundary}</p>
      </div>
      <div className="tool-card-footer">
        <ul aria-label={`${tool.title}关键词`}>
          {tool.tags.slice(0, 3).map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
        <span className="tool-action">打开工具 <span aria-hidden="true">↗</span></span>
      </div>
    </>
  );

  return (
    <Link href={tool.href ?? "#"} className={`tool-card tool-card-live tool-card-tone-${index % 4} focus-ring`}>
      {content}
    </Link>
  );
}

export function ToolDirectory({ tools }: ToolDirectoryProps) {
  const [category, setCategory] = useState<ToolCategoryFilter>("全部");

  const visibleTools = useMemo(() => {
    return tools.filter((tool) => category === "全部" || tool.category === category);
  }, [category, tools]);

  const resetFilters = () => setCategory("全部");

  return (
    <section id="tools" className="tool-directory" aria-labelledby="tools-title">
      <div className="directory-heading">
        <div>
          <p className="directory-kicker">招新演示版 / 04 TOOLS</p>
          <h2 id="tools-title">四个工具，按需打开。</h2>
        </div>
        <p>每张卡都是独立入口。当前四项均为本地可用，不代表已经部署到公网。</p>
      </div>

      <div className="directory-controls" aria-label="按分类筛选">
        <div className="category-filter" aria-label="按分类筛选">
          {toolCategories.map((item) => (
            <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className="category-button focus-ring">{item}</button>
          ))}
        </div>
      </div>

      <div className="directory-meta">
        <p aria-live="polite">显示 {visibleTools.length} / {tools.length} 项 · 全部是本地可用</p>
        {category !== "全部" && <button type="button" onClick={resetFilters} className="reset-button focus-ring">清除筛选</button>}
      </div>

      {visibleTools.length > 0 ? (
        <div className="tool-grid">{visibleTools.map((tool, index) => <ToolCard key={tool.slug} tool={tool} index={index} />)}</div>
      ) : (
        <div className="empty-state" role="status">
          <p className="empty-stamp">NO MATCH</p>
          <p className="empty-title">没有匹配的工具</p>
          <p className="empty-copy">清除分类条件即可查看全部四项工具。目录不会把路线图或旧工具混进来。</p>
          <button type="button" onClick={resetFilters} className="empty-action focus-ring">查看四项工具</button>
        </div>
      )}
    </section>
  );
}
