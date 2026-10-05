"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./operation-progress.module.css";

type OperationProgressProps = {
  scope: string;
  messages: readonly string[];
  syncing?: boolean;
};

function activeMessage(messages: readonly string[], syncing: boolean) {
  if (syncing) return messages.find((message) => /会话|登录状态|登录/.test(message)) ?? "正在同步服务端数据…";
  return messages.find((message) => /请稍候|重新(同步|检查)/.test(message)) ?? "";
}

export function OperationProgress({ scope, messages, syncing = false }: OperationProgressProps) {
  const active = useMemo(() => activeMessage(messages, syncing), [messages, syncing]);
  if (!active) return null;
  return <OperationProgressBody key={active} scope={scope} active={active} />;
}

function OperationProgressBody({ scope, active }: { scope: string; active: string }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, []);

  const stage = elapsedMs < 900
    ? "正在发起请求"
    : elapsedMs < 2_800
      ? "正在等待服务端确认"
      : "仍在等待响应；完成前不会显示为成功";

  return (
    <aside className={styles.progress} aria-label={`${scope}操作进度`} role="status" aria-live="polite">
      <div className={styles.copy}>
        <span className={styles.kicker}>{scope} / LIVE STATUS</span>
        <strong>{stage}</strong>
        <p>{active}</p>
      </div>
      <div className={styles.track} aria-hidden="true"><i /></div>
    </aside>
  );
}
