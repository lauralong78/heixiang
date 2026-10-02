"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./tool-usage-guide.module.css";

export type ToolUsageGuideProps = {
  title: string;
  intro: string;
  steps: Array<{ title: string; detail: string }>;
  note: string;
};

export function ToolUsageGuide({ title, intro, steps, note }: ToolUsageGuideProps) {
  const [open, setOpen] = useState(true);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const reopenButtonRef = useRef<HTMLButtonElement>(null);

  const clampPosition = (left: number, top: number) => {
    const width = Math.min(360, Math.max(0, window.innerWidth - 32));
    const elementHeight = document.querySelector<HTMLElement>(`.${styles.guide}`)?.offsetHeight ?? 320;
    return {
      left: Math.max(16, Math.min(left, window.innerWidth - width - 16)),
      top: Math.max(16, Math.min(top, window.innerHeight - elementHeight - 16)),
    };
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) setOpen(false);
    };
    const handleResize = () => {
      if (position) setPosition((current) => current && clampPosition(current.left, current.top));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) reopenButtonRef.current?.focus();
  }, [open]);

  const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    const guide = event.currentTarget.parentElement;
    if (!guide) return;
    const rect = guide.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.top });
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveGuide = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPosition(clampPosition(event.clientX - dragOffset.current.x, event.clientY - dragOffset.current.y));
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  if (!open) {
    return (
      <button ref={reopenButtonRef} type="button" className={`${styles.reopen} focus-ring`} onClick={() => setOpen(true)} aria-expanded={false}>
        使用说明
      </button>
    );
  }

  return (
    <aside
      className={`${styles.guide} ${dragging ? styles.dragging : ""}`}
      style={position ? { left: position.left, top: position.top, right: "auto", bottom: "auto" } : undefined}
      aria-labelledby={`${title}-guide-title`}
    >
      <div
        className={styles.handle}
        onPointerDown={startDragging}
        onPointerMove={moveGuide}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <span>拖动此处移动</span>
        <button type="button" className={`${styles.close} focus-ring`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)} aria-label={`关闭${title}使用说明`}>
          ×
        </button>
      </div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>第一次使用？</p>
        <h2 id={`${title}-guide-title`}>{title}怎么用</h2>
        <p className={styles.intro}>{intro}</p>
        <ol>
          {steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
        <p className={styles.note}><strong>提醒</strong>{note}</p>
      </div>
    </aside>
  );
}
