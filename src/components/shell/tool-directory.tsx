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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategoryFilter>("全部");

  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return tools.filter((tool) => {
      const matchesCategory = category === "全部" || tool.category === category;
      const searchText = [tool.title, tool.description, tool.category, tool.boundary, ...tool.tags].join(" ").toLocaleLowerCase("zh-CN");
      return matchesCategory && searchText.includes(normalizedQuery);
    });
  }, [category, query, tools]);

  const resetFilters = () => { setQuery(""); setCategory("全部"); };

  return (
    <section id="tools" className="tool-directory" aria-labelledby="tools-title">
      <div className="directory-heading">
        <div>
          <p className="directory-kicker">招新演示版 / 04 TOOLS</p>
          <h2 id="tools-title">四个工具，按需打开。</h2>
        </div>
        <p>每张卡都是独立入口。当前四项均为本地可用，不代表已经部署到公网。</p>
      </div>

      <div className="directory-controls" role="search" aria-label="筛选工具">
        <label className="search-field">
          <span className="sr-only">搜索工具</span>
          <span className="search-prefix" aria-hidden="true">/</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具、场景或关键词" className="search-input" />
        </label>
        <div className="category-filter" aria-label="按分类筛选">
          {toolCategories.map((item) => (
            <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className="category-button focus-ring">{item}</button>
          ))}
        </div>
      </div>

      <div className="directory-meta">
        <p aria-live="polite">显示 {visibleTools.length} / {tools.length} 项 · 全部是本地可用</p>
        {(query || category !== "全部") && <button type="button" onClick={resetFilters} className="reset-button focus-ring">清除筛选</button>}
      </div>

      {visibleTools.length > 0 ? (
        <div className="tool-grid">{visibleTools.map((tool, index) => <ToolCard key={tool.slug} tool={tool} index={index} />)}</div>
      ) : (
        <div className="empty-state" role="status">
          <p className="empty-stamp">NO MATCH</p>
          <p className="empty-title">没有匹配的工具</p>
          <p className="empty-copy">换一个关键词，或者清除分类条件。目录不会把路线图或旧工具混进来。</p>
          <button type="button" onClick={resetFilters} className="empty-action focus-ring">查看四项工具</button>
        </div>
      )}
    </section>
  );
}
