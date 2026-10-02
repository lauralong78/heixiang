"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { DOCS_ASSISTANT_AI } from "@/lib/docs-assistant/ai-boundary";
import {
  DOCS_ASSISTANT_STORAGE_KEY,
  FIELD_LIMITS,
  createEmptyDraft,
  generateDocuments,
  getMissingItems,
  normalizeDraft,
  safeFileStem,
  validateUrl,
} from "@/lib/docs-assistant/generator";
import type {
  DocsAssistantDraft,
  GeneratedDocuments,
  ImprovementDraft,
} from "@/lib/docs-assistant/types";

import styles from "./docs-assistant.module.css";

type DocumentKey = keyof GeneratedDocuments;
type SimpleField = Exclude<keyof DocsAssistantDraft, "risks" | "improvements">;
type StoredWorkspace = {
  draft: unknown;
  readme?: unknown;
  onePager?: unknown;
  readmeEdited?: unknown;
  onePagerEdited?: unknown;
};

const INITIAL_DRAFT = createEmptyDraft();
const INITIAL_DOCUMENTS = generateDocuments(INITIAL_DRAFT);

const FIELD_SECTIONS: Array<{
  title: string;
  note: string;
  fields: Array<{
    name: SimpleField;
    label: string;
    placeholder: string;
    multiline?: boolean;
    limit: number;
  }>;
}> = [
  {
    title: "01 · 项目是什么",
    note: "先说清问题，再说功能。",
    fields: [
      { name: "projectName", label: "项目名", placeholder: "例如：黑箱", limit: FIELD_LIMITS.short },
      { name: "problem", label: "一句话问题", placeholder: "什么人在什么情况下遇到了什么问题？", multiline: true, limit: FIELD_LIMITS.medium },
      { name: "targetUsers", label: "目标用户", placeholder: "用户是谁？典型使用场景是什么？", multiline: true, limit: FIELD_LIMITS.medium },
      { name: "coreFeatures", label: "核心功能", placeholder: "每行一项，只写真实已完成的功能", multiline: true, limit: FIELD_LIMITS.long },
    ],
  },
  {
    title: "02 · 如何实现",
    note: "让陌生人能理解、能跑起来。",
    fields: [
      { name: "techStack", label: "技术栈", placeholder: "每行一项：Next.js、TypeScript…", multiline: true, limit: FIELD_LIMITS.medium },
      { name: "setupSteps", label: "安装 / 运行步骤", placeholder: "每行一步，包含环境、安装、配置、启动", multiline: true, limit: FIELD_LIMITS.long },
      { name: "dataApiDesign", label: "数据或接口设计", placeholder: "数据从哪里来、怎么处理、去哪里；无接口也请如实说明", multiline: true, limit: FIELD_LIMITS.long },
    ],
  },
  {
    title: "03 · 贡献与复盘",
    note: "如实界定自己、AI 和团队的工作。",
    fields: [
      { name: "responsibility", label: "本人负责部分", placeholder: "你亲自负责了哪些模块和决策？", multiline: true, limit: FIELD_LIMITS.long },
      { name: "aiUsage", label: "AI 使用情况", placeholder: "是否使用？用在哪里？怎么人工核验？未使用也请明确写出", multiline: true, limit: FIELD_LIMITS.long },
      { name: "challenge", label: "最大困难与解法", placeholder: "困难是什么？尝试了什么？最终如何处理？", multiline: true, limit: FIELD_LIMITS.long },
    ],
  },
];

const LINK_FIELDS: Array<{ name: SimpleField; label: string; placeholder: string }> = [
  { name: "repositoryUrl", label: "仓库链接", placeholder: "https://github.com/owner/repo" },
  { name: "deploymentUrl", label: "部署链接", placeholder: "https://example.com" },
  { name: "demoUrl", label: "演示材料", placeholder: "https://example.com/demo" },
];

export function DocsAssistant() {
  const [draft, setDraft] = useState<DocsAssistantDraft>(INITIAL_DRAFT);
  const [documents, setDocuments] = useState<GeneratedDocuments>(INITIAL_DOCUMENTS);
  const [edited, setEdited] = useState<Record<DocumentKey, boolean>>({ readme: false, onePager: false });
  const [activeDocument, setActiveDocument] = useState<DocumentKey>("readme");
  const [activeView, setActiveView] = useState<"edit" | "preview">("edit");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [busyAction, setBusyAction] = useState<"copy" | "download" | null>(null);
  const missingItems = useMemo(() => getMissingItems(draft), [draft]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(DOCS_ASSISTANT_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredWorkspace;
          const restoredDraft = normalizeDraft(stored.draft);
          const generated = generateDocuments(restoredDraft);
          setDraft(restoredDraft);
          setDocuments({
            readme: typeof stored.readme === "string" ? stored.readme : generated.readme,
            onePager: typeof stored.onePager === "string" ? stored.onePager : generated.onePager,
          });
          setEdited({
            readme: stored.readmeEdited === true,
            onePager: stored.onePagerEdited === true,
          });
          setStatus("已恢复上次保存的本地草稿。");
        }
      } catch {
        setStorageWarning("本地草稿无法读取，已使用空白表单。");
      } finally {
        setHydrated(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DOCS_ASSISTANT_STORAGE_KEY, JSON.stringify({
        draft,
        ...documents,
        readmeEdited: edited.readme,
        onePagerEdited: edited.onePager,
      }));
      queueMicrotask(() => setStorageWarning(""));
    } catch {
      queueMicrotask(() => setStorageWarning("浏览器未能保存草稿；请尽快下载文件，避免刷新后丢失。"));
    }
  }, [draft, documents, edited, hydrated]);

  function applyDraft(next: DocsAssistantDraft) {
    setDraft(next);
    const generated = generateDocuments(next);
    setDocuments((current) => ({
      readme: edited.readme ? current.readme : generated.readme,
      onePager: edited.onePager ? current.onePager : generated.onePager,
    }));
    setStatus("");
  }

  function updateField(name: SimpleField, value: string) {
    applyDraft({ ...draft, [name]: value });
  }

  function updateRisk(index: number, value: string) {
    const risks = [...draft.risks] as DocsAssistantDraft["risks"];
    risks[index] = value;
    applyDraft({ ...draft, risks });
  }

  function updateImprovement(index: number, patch: Partial<ImprovementDraft>) {
    const improvements = draft.improvements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) as DocsAssistantDraft["improvements"];
    applyDraft({ ...draft, improvements });
  }

  function regenerate() {
    setDocuments(generateDocuments(draft));
    setEdited({ readme: false, onePager: false });
    setStatus("已根据当前表单重新生成两份文档。");
  }

  function clearWorkspace() {
    if (!window.confirm("确定清除表单、两份文档和本地草稿吗？此操作无法撤销。")) return;
    const empty = createEmptyDraft();
    setDraft(empty);
    setDocuments(generateDocuments(empty));
    setEdited({ readme: false, onePager: false });
    localStorage.removeItem(DOCS_ASSISTANT_STORAGE_KEY);
    setStatus("表单、文档与本地草稿已清除。");
  }

  async function copyCurrent() {
    setBusyAction("copy");
    try {
      await navigator.clipboard.writeText(documents[activeDocument]);
      setStatus(`${documentLabel(activeDocument)}的当前编辑版本已复制。`);
    } catch {
      setStatus("复制失败：浏览器未授予剪贴板权限，请在编辑区手动复制。");
    } finally {
      window.setTimeout(() => setBusyAction(null), 500);
    }
  }

  function download(key: DocumentKey) {
    setBusyAction("download");
    const fileName = key === "readme" ? "README.md" : `${safeFileStem(draft.projectName)}-一页说明.md`;
    downloadText(fileName, documents[key], "text/markdown;charset=utf-8");
    setStatus(`${fileName} 已下载，内容为当前编辑版本。`);
    window.setTimeout(() => setBusyAction(null), 500);
  }

  const currentText = documents[activeDocument];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <p className={styles.kicker}>黑箱 / DELIVERY DESK 203</p>
            <h1>把项目情况<br />写清楚。</h1>
            <p className={styles.lede}>把已经确认的内容填进来。缺的信息会直接标出来，不会替你编。</p>
          </div>
          <div className={styles.heroMeta}>
            <span><b>LOCAL</b> 仅在浏览器处理</span>
            <span><b>2 × MD</b> 真实文件下载</span>
            <span><b>NO FETCH</b> 链接不发起请求</span>
          </div>
        </header>

        <section className={styles.noticeRow} aria-label="工具状态">
          <span className={styles.localBadge}>无 Key · 无网络可用</span>
          <span className={styles.aiBadge} title="仅预留接口类型，当前没有实现、按钮或请求">{DOCS_ASSISTANT_AI.label}</span>
          <span className={styles.saveState}>{hydrated ? "自动保存本地草稿" : "正在读取本地草稿…"}</span>
        </section>

        {(storageWarning || status) && (
          <div className={storageWarning ? styles.warning : styles.status} role={storageWarning ? "alert" : "status"} aria-live="polite">
            {storageWarning || status}
          </div>
        )}

        <div className={styles.workspace}>
          <form className={styles.formPanel} onSubmit={(event) => event.preventDefault()}>
            <div className={styles.panelTitle}>
              <div><span>INPUT / 事实</span><h2>项目资料表</h2></div>
              <button type="button" className={styles.dangerButton} onClick={clearWorkspace}>清除草稿</button>
            </div>

            {FIELD_SECTIONS.map((section) => (
              <fieldset className={styles.fieldset} key={section.title}>
                <legend>{section.title}</legend>
                <p className={styles.sectionNote}>{section.note}</p>
                {section.fields.map((field) => (
                  <TextField
                    key={field.name}
                    id={`docs-${field.name}`}
                    label={field.label}
                    value={draft[field.name]}
                    placeholder={field.placeholder}
                    limit={field.limit}
                    multiline={field.multiline}
                    onChange={(value) => updateField(field.name, value)}
                  />
                ))}
              </fieldset>
            ))}

            <fieldset className={styles.fieldset}>
              <legend>04 · 风险与边界</legend>
              <p className={styles.sectionNote}>必须至少 3 个；可写隐私、性能、数据、法律或验证边界。</p>
              {draft.risks.map((risk, index) => (
                <TextField key={index} id={`docs-risk-${index}`} label={`风险 / 边界 ${index + 1}`} value={risk} placeholder="说清具体风险及适用边界" limit={FIELD_LIMITS.medium} multiline onChange={(value) => updateRisk(index, value)} />
              ))}
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>05 · 后续改进</legend>
              <p className={styles.sectionNote}>填写 2–3 个，每个都要说明优先级和代价。</p>
              {draft.improvements.map((item, index) => (
                <div className={styles.improvement} key={index}>
                  <span className={styles.itemNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <TextField id={`docs-improvement-${index}`} label="改进内容" value={item.title} placeholder="例如：增加离线模式" limit={FIELD_LIMITS.medium} onChange={(value) => updateImprovement(index, { title: value })} />
                  <div className={styles.improvementMeta}>
                    <TextField id={`docs-priority-${index}`} label="优先级" value={item.priority} placeholder="P1 / 高" limit={FIELD_LIMITS.short} onChange={(value) => updateImprovement(index, { priority: value })} />
                    <TextField id={`docs-cost-${index}`} label="代价" value={item.cost} placeholder="例如：2 人日" limit={FIELD_LIMITS.medium} onChange={(value) => updateImprovement(index, { cost: value })} />
                  </div>
                </div>
              ))}
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>06 · 提交与演示链接</legend>
              <p className={styles.sectionNote}>只把 URL 写入文档，不会访问或检查链接内容。仅接受 http/https。</p>
              {LINK_FIELDS.map((field) => {
                const value = draft[field.name];
                const check = validateUrl(value);
                return (
                  <TextField key={field.name} id={`docs-${field.name}`} label={field.label} value={value} placeholder={field.placeholder} limit={FIELD_LIMITS.url} inputMode="url" error={check.status === "invalid" ? check.reason : undefined} onChange={(next) => updateField(field.name, next)} />
                );
              })}
            </fieldset>
          </form>

          <aside className={styles.checklistPanel}>
            <div className={styles.panelTitle}>
              <div><span>GAP / 缺什么</span><h2>提交检查单</h2></div>
              <strong className={missingItems.length ? styles.missingCount : styles.completeCount}>{missingItems.length}</strong>
            </div>
            {missingItems.length ? (
              <ul className={styles.missingList}>
                {missingItems.map((item) => (
                  <li key={item.id}><span>{item.group.toUpperCase()}</span><strong>{item.label}</strong><p>{item.detail}</p></li>
                ))}
              </ul>
            ) : (
              <div className={styles.completeState}><b>✓</b><h3>字段已齐</h3><p>这只证明表单完整，还需人工核对事实、链接和演示。</p></div>
            )}
          </aside>
        </div>

        <section className={styles.outputPanel} aria-labelledby="output-title">
          <div className={styles.outputHeader}>
            <div><span>OUTPUT / 交付件</span><h2 id="output-title">编辑与安全预览</h2></div>
            <button type="button" className={styles.regenerateButton} onClick={regenerate} aria-label="根据表单重新生成两份文档">重新生成两份文档</button>
          </div>
          <p className={styles.regenerateWarning}>重新生成会覆盖两份文档的手动修改。复制和下载始终使用当前编辑版本。</p>

          <div className={styles.documentTabs} role="tablist" aria-label="选择文档">
            {(["readme", "onePager"] as const).map((key) => (
              <button
                key={key}
                id={`document-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeDocument === key}
                aria-controls="document-panel"
                onClick={() => setActiveDocument(key)}
              >
                {documentLabel(key)} {edited[key] && <small>已手动修改</small>}
              </button>
            ))}
          </div>
          <div className={styles.mobileViewTabs} aria-label="编辑或预览">
            <button type="button" aria-pressed={activeView === "edit"} onClick={() => setActiveView("edit")}>编辑</button>
            <button type="button" aria-pressed={activeView === "preview"} onClick={() => setActiveView("preview")}>预览</button>
          </div>

          <div className={styles.documentDesk}>
            <div
              id="document-panel"
              role="tabpanel"
              aria-labelledby={`document-tab-${activeDocument}`}
              className={`${styles.editorPane} ${activeView !== "edit" ? styles.mobileHidden : ""}`}
            >
              <div className={styles.paneLabel}><span>MARKDOWN EDITOR</span><span>{currentText.length.toLocaleString("zh-CN")} 字符</span></div>
              <textarea aria-label={`${documentLabel(activeDocument)} Markdown 编辑器`} value={currentText} spellCheck={false} onChange={(event) => {
                setDocuments((current) => ({ ...current, [activeDocument]: event.target.value }));
                setEdited((current) => ({ ...current, [activeDocument]: true }));
                setStatus("");
              }} />
            </div>
            <div
              role="region"
              aria-label={`${documentLabel(activeDocument)}安全预览`}
              className={`${styles.previewPane} ${activeView !== "preview" ? styles.mobileHidden : ""}`}
            >
              <div className={styles.paneLabel}><span>SAFE PREVIEW</span><span>NO innerHTML</span></div>
              <MarkdownPreview markdown={currentText} />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={copyCurrent} disabled={busyAction !== null} aria-busy={busyAction === "copy"}>{busyAction === "copy" ? "复制中…" : "复制当前文档"}</button>
            <button type="button" onClick={() => download(activeDocument)} disabled={busyAction !== null} aria-busy={busyAction === "download"}>{busyAction === "download" ? "准备下载…" : `下载 ${activeDocument === "readme" ? "README.md" : "一页说明.md"}`}</button>
            <button type="button" className={styles.secondaryDownload} onClick={() => download(activeDocument === "readme" ? "onePager" : "readme")}>下载另一份</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function documentLabel(key: DocumentKey) {
  return key === "readme" ? "README.md 草稿" : "一页项目说明";
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function TextField({ id, label, value, placeholder, limit, multiline = false, inputMode, error, onChange }: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  limit: number;
  multiline?: boolean;
  inputMode?: "url";
  error?: string;
  onChange: (value: string) => void;
}) {
  const props = {
    id,
    value,
    placeholder,
    maxLength: limit,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    "aria-invalid": Boolean(error),
    "aria-describedby": `${id}-meta${error ? ` ${id}-error` : ""}`,
  };
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.labelRow}><b>{label}</b><small id={`${id}-meta`}>{value.length}/{limit}</small></span>
      {multiline ? <textarea {...props} rows={4} /> : <input {...props} type="text" inputMode={inputMode} spellCheck={inputMode !== "url"} />}
      {error && <span className={styles.fieldError} id={`${id}-error`}>{error}</span>}
    </label>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const rows = markdown.split(/\r?\n/);
  return (
    <article className={styles.markdownPreview} aria-label="Markdown 安全预览">
      {rows.map((line, index) => {
        if (!line.trim()) return <div className={styles.previewSpace} key={index} aria-hidden="true" />;
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
          const content = renderInline(heading[2], index);
          if (heading[1].length === 1) return <h1 key={index}>{content}</h1>;
          if (heading[1].length === 2) return <h2 key={index}>{content}</h2>;
          return <h3 key={index}>{content}</h3>;
        }
        const bullet = /^-\s+(.*)$/.exec(line);
        if (bullet) return <div className={styles.previewList} key={index}><span>•</span><p>{renderInline(bullet[1], index)}</p></div>;
        const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
        if (ordered) return <div className={styles.previewList} key={index}><span>{ordered[1]}.</span><p>{renderInline(ordered[2], index)}</p></div>;
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) return <blockquote key={index}>{renderInline(quote[1], index)}</blockquote>;
        return <p key={index}>{renderInline(line, index)}</p>;
      })}
    </article>
  );
}

function renderInline(value: string, row: number) {
  const linkPattern = /\[([^\]]+)]\(<(https?:\/\/[^>]+)>\)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(linkPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const check = validateUrl(match[2]);
    nodes.push(check.status === "valid" ? <a href={check.value} target="_blank" rel="noreferrer" key={`${row}-${start}`}>{match[1]}</a> : <Fragment key={`${row}-${start}`}>{match[0]}</Fragment>);
    cursor = start + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes.length ? nodes : value;
}
