"use client";

import { useState } from "react";

import {
  CARD_LIMITS,
  EMPTY_CARD,
  exportCardPng,
  getCardContent,
  hasCardContent,
  type CardDraft,
} from "@/lib/card/card";

import styles from "./card.module.css";

type FieldName = keyof CardDraft;

const FIELDS: Array<{
  name: FieldName;
  label: string;
  placeholder: string;
  hint: string;
  multiline?: boolean;
}> = [
  {
    name: "name",
    label: "称呼",
    placeholder: "例如：林一 / Nova",
    hint: "队友会怎么叫你？",
  },
  {
    name: "role",
    label: "角色",
    placeholder: "例如：产品设计 / 全栈开发",
    hint: "你希望负责什么？",
  },
  {
    name: "skills",
    label: "技能",
    placeholder: "React，视觉设计，路演",
    hint: "用逗号分隔，最多展示 8 项",
  },
  {
    name: "interests",
    label: "兴趣",
    placeholder: "AI Agent，教育，开源",
    hint: "你想解决什么领域的问题？",
  },
  {
    name: "bio",
    label: "简介",
    placeholder: "我擅长把模糊想法快速做成可演示的产品……",
    hint: "一句话说明你的特点或组队期待",
    multiline: true,
  },
];

export function CardEditor() {
  const [draft, setDraft] = useState<CardDraft>(EMPTY_CARD);
  const [status, setStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const content = getCardContent(draft);
  const canExport = hasCardContent(draft) && !isExporting;

  function updateField(name: FieldName, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setStatus("");
  }

  async function handleExport() {
    if (!hasCardContent(draft)) {
      setStatus("请先填写至少一项内容，再下载名片。");
      return;
    }

    setIsExporting(true);
    setStatus("正在生成 PNG…");
    try {
      const size = await exportCardPng(draft);
      setStatus(`PNG 已下载（${Math.max(1, Math.round(size / 1024))} KB）。`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "未知错误";
      setStatus(`下载失败：${detail} 请稍后重试，或换用新版浏览器。`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.toolMark}>
          <span className={styles.statusDot} aria-hidden="true" />
          无需登录 · 本地生成
        </div>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>TEAM SIGNAL / 组队信号</p>
        <h1>先让队友知道<br />你会什么。</h1>
        <p className={styles.lede}>
          填上角色、技能和想做的方向，右边会马上生成一张名片。确认没问题后下载 PNG。
        </p>
      </section>

      <div className={styles.workspace}>
        <form className={styles.formPanel} onSubmit={(event) => event.preventDefault()}>
          <div className={styles.panelHeading}>
            <div>
              <span>01</span>
              <h2>填写你的信号</h2>
            </div>
            <button
              className={styles.clearButton}
              type="button"
              onClick={() => {
                if (!window.confirm("确认清空这张名片的全部内容吗？此操作无法撤销。")) return;
                setDraft(EMPTY_CARD);
                setStatus("内容已清空。");
              }}
              disabled={!hasCardContent(draft)}
            >
              清空
            </button>
          </div>

          <div className={styles.fieldGrid}>
            {FIELDS.map((field) => {
              const id = `card-${field.name}`;
              const currentLength = draft[field.name].length;
              const maxLength = CARD_LIMITS[field.name];
              const commonProps = {
                id,
                name: field.name,
                value: draft[field.name],
                placeholder: field.placeholder,
                maxLength,
                onChange: (
                  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                ) => updateField(field.name, event.target.value),
                "aria-describedby": `${id}-hint ${id}-count`,
              };

              return (
                <div
                  className={`${styles.field} ${field.multiline ? styles.fullField : ""}`}
                  key={field.name}
                >
                  <div className={styles.labelRow}>
                    <label htmlFor={id}>{field.label}</label>
                    <span id={`${id}-count`}>{currentLength}/{maxLength}</span>
                  </div>
                  {field.multiline ? (
                    <textarea {...commonProps} rows={4} />
                  ) : (
                    <input {...commonProps} type="text" />
                  )}
                  <p id={`${id}-hint`}>{field.hint}</p>
                </div>
              );
            })}
          </div>
        </form>

        <section className={styles.previewPanel} aria-labelledby="preview-heading">
          <div className={styles.panelHeading}>
            <div>
              <span>02</span>
              <h2 id="preview-heading">实时预览</h2>
            </div>
            <span className={styles.liveBadge}>LIVE</span>
          </div>

          <article className={styles.card} aria-label="组队名片预览">
            <div className={styles.cardTopline}>
              <span>OPEN TO TEAM</span>
              <b>黑箱 / 001</b>
            </div>
            <div className={styles.identity}>
              <h3 className={!content.name ? styles.placeholder : ""}>
                {content.name || "等待你的名字"}
              </h3>
              <p className={!content.role ? styles.placeholder : ""}>
                {content.role || "你想在团队中扮演什么角色？"}
              </p>
            </div>
            <div className={styles.cardRows}>
              <TagRow label="技能" tags={content.skills} />
              <TagRow label="兴趣" tags={content.interests} />
            </div>
            <div className={styles.about}>
              <span>ABOUT</span>
              <p className={!content.bio ? styles.placeholder : ""}>
                {content.bio || "用一句话介绍你想做的事，或者你正在寻找的队友。"}
              </p>
            </div>
            <div className={styles.cardPlus} aria-hidden="true">+</div>
          </article>

          <div className={styles.exportArea}>
            <button
              className={styles.exportButton}
              type="button"
              onClick={handleExport}
              disabled={!canExport}
            >
              <span>{isExporting ? "生成中…" : "下载 PNG"}</span>
              <span aria-hidden="true">↘</span>
            </button>
            <p className={styles.exportHint}>
              {hasCardContent(draft)
                ? "1200 × 675 PNG · 内容仅在你的浏览器中处理"
                : "填写任意一项后即可下载"}
            </p>
            <p className={styles.status} role="status" aria-live="polite">
              {status}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className={styles.tagRow}>
      <span>{label}</span>
      <div>
        {(tags.length ? tags : ["待补充"]).map((tag, index) => (
          <b className={!tags.length ? styles.placeholderTag : ""} key={`${tag}-${index}`}>
            {tag}
          </b>
        ))}
      </div>
    </div>
  );
}
