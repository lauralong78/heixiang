"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "../progress-board/progress-board.module.css";

type AuthMode = "login" | "register";
type PublicUser = { id: string; loginId: string; status: string; createdAt: string };

function extractMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") {
      if (error.message.includes("暂时不可用")) return "服务端暂时无法连接数据库，请检查本地网络后重试。";
      return error.message;
    }
  }
  return fallback;
}

export function FormalAuthApp() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("正在检查登录状态…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/formal-board/auth/me", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as unknown }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (response.ok && payload && typeof payload === "object" && "data" in payload) {
          const data = (payload as { data?: { user?: PublicUser } }).data;
          setUser(data?.user ?? null);
          setMessage(data?.user ? "已恢复上次登录。" : "");
        } else {
          setMessage("");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("暂时无法读取登录状态，请检查网络后重试。");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "register" && password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }
    setBusy(true);
    setMessage(mode === "register" ? "正在创建账号…" : "正在登录…");
    try {
      const response = await fetch(`/api/formal-board/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        setMessage(extractMessage(payload, "请求失败，请稍后重试。"));
        return;
      }
      const data = (payload as { data?: { user?: PublicUser } }).data;
      setUser(data?.user ?? null);
      setPassword("");
      setConfirmPassword("");
      setMessage(mode === "register" ? "账号已创建，请继续进入正式版看板。" : "登录成功。登录状态由安全 Cookie 保存。" );
    } catch {
      setMessage("网络连接失败，数据没有被标记为成功。请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage("正在退出…");
    try {
      const response = await fetch("/api/formal-board/auth/logout", { method: "POST" });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        setMessage(extractMessage(payload, "退出失败，请稍后重试。"));
        return;
      }
      setUser(null);
      setMode("login");
      setMessage("已退出登录。");
    } catch {
      setMessage("网络连接失败，退出状态未确认。请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.scanline} aria-hidden="true" />
      <header className={styles.topbar}>
        <span>FORMAL BOARD / AUTH</span>
        <span>DESKTOP FIRST · SERVER SESSION</span>
      </header>
      <section className={styles.setupShell}>
        <div className={styles.setupIntro}>
          <span className={styles.kicker}>黑箱正式版 · HK-300</span>
          <h1>把进度，<br />放到同一个地方。</h1>
          <p>跨设备登录后，活动、队伍和任务才会真正属于你。这里是正式版入口；原来的本机演示仍然独立保留。</p>
          <p className={styles.authHint}>第一阶段仅支持桌面浏览器。账号使用自选唯一 ID 和密码，密码不会出现在页面响应里。</p>
        </div>

        <div className={styles.setupForm}>
          {user ? (
            <div className={styles.authStatus}>
              <span className={styles.formIndex}>01 / SESSION ACTIVE</span>
              <strong>欢迎回来，{user.loginId}</strong>
              <p>你的正式版登录状态已由服务器确认。活动看板页面还在接入中。</p>
              <button type="button" className={styles.primaryButton} onClick={logout} disabled={busy}>
                <span>{busy ? "退出中…" : "退出登录"}</span><b>↗</b>
              </button>
              <p className={styles.authHint}>不要把浏览器 Cookie、密码或 Secret key 分享给任何人。</p>
            </div>
          ) : (
            <>
              <span className={styles.formIndex}>01 / {mode === "login" ? "LOG IN" : "SIGN UP"}</span>
              <div className={styles.authMode} role="tablist" aria-label="账号操作">
                <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? styles.authModeActive : ""} onClick={() => { setMode("login"); setMessage(""); }}>登录</button>
                <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? styles.authModeActive : ""} onClick={() => { setMode("register"); setMessage(""); }}>注册</button>
              </div>
              <form onSubmit={submit}>
                <label>
                  自选唯一 ID
                  <input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" placeholder="例如 blackbox_01" required />
                </label>
                <label>
                  密码
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 10 位" required />
                </label>
                {mode === "register" && (
                  <label>
                    再输入一次密码
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="确认密码" required />
                  </label>
                )}
                <button className={styles.primaryButton} type="submit" disabled={busy}>
                  <span>{busy ? "请稍候…" : mode === "login" ? "进入正式版" : "创建账号"}</span><b>↗</b>
                </button>
              </form>
              <p className={styles.message} role="status" aria-live="polite">{message}</p>
              <p className={styles.authHint}>账号注册和登录会连接真实服务器；失败时不会显示“已保存”假提示。</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
