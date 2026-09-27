"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  toolCategories,
  type HackKitTool,
  type ToolCategoryFilter,
} from "@/lib/tools";

type ToolDirectoryProps = { tools: HackKitTool[] };

function ToolCard({ tool }: { tool: HackKitTool }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="tool-category">{tool.category}</span>
        <span className={tool.status === "available" ? "status-live" : "status-roadmap"}>
          {tool.status === "available" ? "可用" : "路线图"}
        </span>
      </div>
      <div className="mt-8">
        <h3 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text)]">
          {tool.title}
        </h3>
        <p className="mt-3 max-w-[42ch] text-sm leading-6 text-[var(--text-muted)]">
          {tool.description}
        </p>
      </div>
      <div className="mt-8 flex items-end justify-between gap-4">
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="关键词">
          {tool.tags.slice(0, 3).map((tag) => (
            <li key={tag} className="font-mono text-[11px] text-[var(--text-faint)]">{tag}</li>
          ))}
        </ul>
        {tool.status === "available" ? (
          <span className="tool-action">打开工具 <span aria-hidden="true">↗</span></span>
        ) : (
          <span className="tool-unavailable">尚未接通</span>
        )}
      </div>
    </>
  );

  if (tool.status === "available" && tool.href) {
    return <Link href={tool.href} className="tool-card tool-card-live focus-ring">{content}</Link>;
  }

  return <article className="tool-card tool-card-roadmap">{content}</article>;
}

export function ToolDirectory({ tools }: ToolDirectoryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategoryFilter>("全部");

  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return tools.filter((tool) => {
      const matchesCategory = category === "全部" || tool.category === category;
      const searchText = [tool.title, tool.description, tool.category, ...tool.tags]
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      return matchesCategory && searchText.includes(normalizedQuery);
    });
  }, [category, query, tools]);

  const resetFilters = () => {
    setQuery("");
    setCategory("全部");
  };

  return (
    <section id="tools" className="scroll-mt-24 py-16 md:py-24" aria-labelledby="tools-title">
      <div className="mb-8 max-w-2xl">
        <h2 id="tools-title" className="section-title">你现在要做什么？</h2>
        <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
          选一个直接打开。队友匹配、投票墙和签到领取采用同一浏览器本机身份切换，不等同于线上账号或跨设备协作。
        </p>
      </div>

      <div className="directory-controls" role="search" aria-label="筛选工具">
        <label className="search-field">
          <span className="sr-only">搜索工具</span>
          <span className="search-prefix" aria-hidden="true">/</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索工具、场景或关键词"
            className="search-input"
          />
        </label>

        <div className="category-filter" aria-label="按分类筛选">
          {toolCategories.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className="category-button focus-ring"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 font-mono text-xs text-[var(--text-faint)]">
        <p aria-live="polite">显示 {visibleTools.length} 个工具</p>
        {(query || category !== "全部") && (
          <button type="button" onClick={resetFilters} className="reset-button focus-ring">清除筛选</button>
        )}
      </div>

      {visibleTools.length > 0 ? (
        <div className="tool-grid mt-7">
          {visibleTools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}
        </div>
      ) : (
        <div className="empty-state mt-7" role="status">
          <p className="text-lg font-semibold text-[var(--text)]">没有匹配的工具</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">换一个关键词，或者清除分类条件再试。</p>
          <button type="button" onClick={resetFilters} className="empty-action focus-ring">查看全部工具</button>
        </div>
      )}
    </section>
  );
}
