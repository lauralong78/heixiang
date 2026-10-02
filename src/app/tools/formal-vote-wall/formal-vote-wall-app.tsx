"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { OperationProgress } from "@/components/shell/operation-progress";
import styles from "./formal-vote-wall.module.css";
import { isCurrentRequest, makeOperationId, resultFor, visibleOptions } from "./formal-vote-wall-state";

const POLL_INTERVAL_MS = 8_000;

export type SyncState = "idle" | "syncing" | "synced" | "failed";
export type ResultMode = "hidden" | "live" | "final";
export type Activity = { id: string; title: string; description?: string; status: string; role: string; updated_at?: string; data_version?: number; pollId?: string | null; poll_id?: string | null };
export type Poll = { id: string; activity_id: string; title: string; description: string; choice_mode: "single-choice"; status: "draft" | "open" | "closed"; result_mode: ResultMode; host_eligible: boolean; allow_self_vote: boolean; data_version: number; created_by: string; closed_at: string | null };
export type Option = { id: string; poll_id: string; title: string; description: string; link: string | null; submitted_by: string | null; status: "published" | "withdrawn" | "removed" };
export type Result = { optionId: string; count: number | null; recordedForViewer: boolean };
export type Snapshot = { poll: Poll; options: Option[]; results: Result[]; viewerVote: { voteId: string; optionId: string; status: "active" | "voided" } | null };
type PublicUser = { id: string; loginId: string; status: string };
type ApiError = { code?: string; message?: string; retryable?: boolean };
type ApiPayload<T> = { ok: true; data: T; requestId: string } | { ok: false; error: ApiError; requestId: string };

function messageFrom(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "error" in error) {
    const apiError = (error as { error?: ApiError }).error;
    if (apiError?.message) return apiError.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function serviceMessage(code?: string) {
  if (code === "UNAUTHENTICATED") return "会话已失效，请回到正式看板重新登录。";
  if (code === "FORBIDDEN") return "当前账号没有查看或管理这项投票的权限。";
  if (code === "NOT_FOUND") return "投票不存在，或当前账号无法看到它。请检查投票 ID。";
  if (code === "CONFLICT") return "版本冲突：数据已被更新，请重新同步后再操作。";
  if (code === "IDEMPOTENCY_KEY_REUSED") return "操作标识已用于其他参数；请重新发起这次操作。";
  if (code === "INTERNAL_ERROR") return "正式投票服务尚未启用，或数据库迁移尚未应用。没有显示假数据。";
  return undefined;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json() as ApiPayload<T>;
  if (!response.ok || !payload.ok) {
    const error = !payload.ok ? payload.error : undefined;
    const failure = new Error(serviceMessage(error?.code) ?? messageFrom(payload, "请求失败，请稍后重试。"));
    Object.assign(failure, { code: error?.code, retryable: error?.retryable });
    throw failure;
  }
  return payload.data;
}

export function FormalVoteWallApp() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  // Render a usable signed-out boundary during SSR as well. If client hydration
  // is delayed or the session probe cannot start, the page must not trap the
  // user behind an endless loading card.
  const [authState, setAuthState] = useState<"checking" | "signed-out" | "signed-in" | "failed">("signed-out");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [pollId, setPollId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("正在确认正式会话；如果当前未登录，可直接前往正式版看板。");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [activitiesAttempt, setActivitiesAttempt] = useState(0);
  const [activitiesMessage, setActivitiesMessage] = useState("");
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);
  const selectedActivityRef = useRef<string | null>(null);

  const [pollDraft, setPollDraft] = useState({ title: "", description: "", resultMode: "hidden" as ResultMode, hostEligible: false, allowSelfVote: false });
  const [optionDraft, setOptionDraft] = useState({ title: "", description: "", link: "" });
  const [editDraft, setEditDraft] = useState({ title: "", description: "", resultMode: "hidden" as ResultMode, hostEligible: false, allowSelfVote: false });
  const [voidDraft, setVoidDraft] = useState<{ voteId: string; reason: string } | null>(null);
  const [writeMessage, setWriteMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sessionAction, setSessionAction] = useState(false);

  const selectedActivity = activities.find((item) => item.id === activityId) ?? null;
  const isHost = selectedActivity?.role === "host";
  const options = useMemo(() => visibleOptions(snapshot), [snapshot]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8_000);
    fetch("/api/formal-board/auth/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, payload: response.status === 401 ? null : await response.json() as ApiPayload<{ user: PublicUser }> }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (response.ok && payload?.ok) { setUser(payload.data.user); setAuthState("signed-in"); setMessage("已恢复正式会话。"); }
        else if (response.status === 401) { setAuthState("signed-out"); setMessage("本机服务已连接，但当前没有正式登录会话。请先登录正式版看板。"); }
        else { setAuthState("failed"); setMessage("服务端返回了无法识别的会话状态；未请求活动和投票数据，请重试。"); }
      })
      .catch((error) => { if (!cancelled) { setAuthState("failed"); setMessage(error instanceof DOMException && error.name === "AbortError" ? "会话检查超时；未请求活动和投票数据，请重试。" : "无法确认登录状态；未请求活动和投票数据。"); } })
      .finally(() => window.clearTimeout(timeoutId));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeoutId); };
  }, [authAttempt]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    window.setTimeout(() => { if (!cancelled) setActivitiesMessage("正在读取可访问活动…"); }, 0);
    api<{ activities: Activity[] }>("/api/formal-board/activities")
      .then((data) => { if (!cancelled) { setActivities(data.activities); setActivitiesMessage(data.activities.length ? "" : "当前账号没有可见活动。"); } })
      .catch((error) => { if (!cancelled) { setActivitiesMessage(messageFrom(error, "活动读取失败；没有显示不完整列表。")); } });
    const queryPollId = new URLSearchParams(window.location.search).get("pollId");
    if (queryPollId) window.setTimeout(() => { if (!cancelled) setPollId(queryPollId); }, 0);
    return () => { cancelled = true; };
  }, [user, activitiesAttempt]);

  const loadSnapshot = useCallback(async (quiet = false) => {
    if (!user || !activityId || !pollId.trim() || inFlightRef.current) return;
    const currentActivityId = activityId;
    const currentPollId = pollId.trim();
    const requestId = ++requestRef.current;
    selectedActivityRef.current = currentActivityId;
    inFlightRef.current = true;
    if (!quiet) setSyncState("syncing");
    try {
      const data = await api<{ snapshot: Snapshot }>(`/api/formal-board/polls/${encodeURIComponent(currentPollId)}`);
      if (!isCurrentRequest(requestId, requestRef.current, currentActivityId, selectedActivityRef.current)) return;
      setSnapshot(data.snapshot);
      setSyncState("synced");
      setLastSyncedAt(new Date().toISOString());
      setMessage("");
      if (data.snapshot.poll.activity_id !== currentActivityId) setMessage("投票与当前活动不匹配，已停止显示其内容。");
    } catch (error) {
      if (!isCurrentRequest(requestId, requestRef.current, currentActivityId, selectedActivityRef.current)) return;
      setSyncState("failed");
      setMessage(messageFrom(error, "投票读取失败，保留当前已知数据。"));
    } finally { inFlightRef.current = false; }
  }, [activityId, pollId, user]);

  useEffect(() => {
    if (!activityId || !pollId.trim()) return;
    const kickoff = window.setTimeout(() => void loadSnapshot(), 0);
    const timer = window.setInterval(() => void loadSnapshot(true), POLL_INTERVAL_MS);
    return () => { window.clearTimeout(kickoff); window.clearInterval(timer); };
  }, [activityId, pollId, loadSnapshot]);

  function chooseActivity(nextId: string) {
    ++requestRef.current;
    setSnapshot(null);
    setActivityId(nextId || null);
    setSyncState("idle");
    const next = activities.find((item) => item.id === nextId);
    const embeddedPollId = next?.pollId ?? next?.poll_id;
    if (embeddedPollId) setPollId(embeddedPollId);
    else setPollId("");
    setMessage(""); setWriteMessage("");
  }

  async function write(url: string, body: unknown, label: string, onSuccess?: (data: unknown) => void) {
    setBusyAction(label); setWriteMessage(`${label}中…`);
    try { const data = await api<unknown>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); onSuccess?.(data); setWriteMessage(`${label}请求已被服务端接受，正在重新同步…`); await loadSnapshot(); }
    catch (error) { setWriteMessage(messageFrom(error, `${label}失败，结果未确认。`)); }
    finally { setBusyAction(null); }
  }

  async function patch(url: string, body: unknown, label: string) {
    setBusyAction(label); setWriteMessage(`${label}中…`);
    try { await api<unknown>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setWriteMessage(`${label}请求已被服务端接受，正在重新同步…`); await loadSnapshot(); }
    catch (error) { setWriteMessage(messageFrom(error, `${label}失败，结果未确认。`)); }
    finally { setBusyAction(null); }
  }

  async function createPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activityId) return;
    await write("/api/formal-board/polls", { activityId, ...pollDraft, operationId: makeOperationId("create-poll") }, "创建投票", (data) => {
      const created = (data as { poll?: Poll }).poll;
      if (created) { setPollId(created.id); setSnapshot(null); }
    });
  }

  async function createOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;
    await write(`/api/formal-board/polls/${encodeURIComponent(snapshot.poll.id)}/options`, { ...optionDraft, link: optionDraft.link || null, submittedBy: null, operationId: makeOperationId("create-option") }, "添加候选项", () => setOptionDraft({ title: "", description: "", link: "" }));
  }

  async function castVote(optionId: string) {
    if (!snapshot || snapshot.poll.status !== "open" || snapshot.viewerVote) return;
    await write(`/api/formal-board/polls/${encodeURIComponent(snapshot.poll.id)}/vote`, { optionId, operationId: makeOperationId("cast-vote") }, "提交投票");
  }

  async function savePoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;
    await patch(`/api/formal-board/polls/${encodeURIComponent(snapshot.poll.id)}`, { ...editDraft, expectedVersion: snapshot.poll.data_version, open: false, close: false, operationId: makeOperationId("update-poll") }, "保存 draft 设置");
  }

  async function changePollState(action: "open" | "close") {
    if (!snapshot) return;
    if (action === "close" && !window.confirm("关闭后投票、候选项和结果将冻结。确定继续吗？")) return;
    await patch(`/api/formal-board/polls/${encodeURIComponent(snapshot.poll.id)}`, { expectedVersion: snapshot.poll.data_version, open: action === "open", close: action === "close", operationId: makeOperationId(action === "open" ? "open-poll" : "close-poll") }, action === "open" ? "开放投票" : "关闭投票");
  }

  async function voidVote() {
    if (!snapshot || !voidDraft?.reason.trim()) { setWriteMessage("作废必须填写原因；不会发送空原因请求。"); return; }
    await write(`/api/formal-board/polls/${encodeURIComponent(snapshot.poll.id)}/void`, { voteId: voidDraft.voteId, reason: voidDraft.reason, operationId: makeOperationId("void-vote") }, "作废投票", () => setVoidDraft(null));
  }

  async function logoutAndRelogin() {
    setSessionAction(true);
    setWriteMessage("正在退出当前身份；确认完成后会回到登录页…");
    try {
      const response = await fetch("/api/formal-board/auth/logout", { method: "POST" });
      const payload = await response.json() as ApiPayload<{ loggedOut: boolean }>;
      if (!response.ok || !payload.ok) throw payload;
      setUser(null);
      setAuthState("signed-out");
      router.push("/tools/formal-board");
    } catch (error) {
      setWriteMessage(messageFrom(error, "退出状态未确认；请检查网络后重试。"));
      setSessionAction(false);
    }
  }

  const resultMode = snapshot?.poll.result_mode ?? "hidden";
  const resultLabel = resultMode === "hidden" ? "结果隐藏" : resultMode === "live" ? "实时结果" : "关闭后结果";

  if (authState === "checking") return <Shell><OperationProgress scope="正式投票墙" syncing messages={["正在确认正式会话；未确认登录前，不会请求活动、投票或候选项数据。"]} /><StatusCard tone="blue" title="正在确认正式会话" body="未确认登录前，不会请求活动、投票或候选项数据。" /></Shell>;
  if (authState === "failed") return <Shell><StatusCard tone="orange" title="会话检查失败" body={message} /><button className={styles.outlineButton} type="button" onClick={() => { setAuthState("checking"); setMessage("正在重新确认正式会话…"); setAuthAttempt((attempt) => attempt + 1); }}>重新检查登录状态</button></Shell>;
  if (!user) return <Shell><header className={styles.hero}><div><p className={styles.kicker}>HK-311 / FORMAL SERVICE</p><h1>把重要选择，<br /><span>交给正式投票。</span></h1><p className={styles.lede}>这是受邀活动的桌面端投票墙。需要先在正式版看板登录，成员权限、候选项与结果都以服务端为准。</p></div><div className={styles.sticker}>PRIVATE<br /><strong>正式服务</strong></div></header><section className={styles.loginCard}><span className={styles.index}>01 / SESSION</span><h2>还没有正式会话</h2><p role="status" aria-live="polite">{message}</p><a className={styles.primaryButton} href="/tools/formal-board">前往正式版看板登录 <span>↗</span></a><p className={styles.smallNote}>旧的 `/tools/vote-wall` 仍是同一浏览器演示，和这里的正式账号能力完全分开。</p></section></Shell>;

  return <Shell><header className={styles.topbar}><div><p className={styles.kicker}>HK-311 / FORMAL VOTE WALL</p><h1>正式投票墙</h1></div><IdentityCard user={user} activity={selectedActivity} onRelogin={() => void logoutAndRelogin()} busy={sessionAction} /></header><div className={styles.noticeRow}><span className={styles.noticeTag}>桌面端</span><p>私有活动 · 服务端授权 · 只显示 API 返回的结果</p><SyncBadge state={syncState} lastSyncedAt={lastSyncedAt} /></div><OperationProgress scope="正式投票墙" syncing={syncState === "syncing" || Boolean(busyAction) || sessionAction} messages={[message, writeMessage, activitiesMessage]} /><div className={styles.workspace}><aside className={styles.sidebar}><div className={styles.sectionHeading}><span className={styles.index}>01 / ACTIVITIES</span><span className={styles.miniLabel}>仅本人可见</span></div><label className={styles.fieldLabel} htmlFor="activity-select">当前活动</label><select id="activity-select" className={styles.select} value={activityId ?? ""} onChange={(event) => chooseActivity(event.target.value)}><option value="">选择一个活动…</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title} · {activity.role}</option>)}</select>{activitiesMessage && <><p className={styles.inlineMessage}>{activitiesMessage}</p><button className={styles.textButton} type="button" onClick={() => setActivitiesAttempt((attempt) => attempt + 1)}>重新读取活动</button></>}<div className={styles.pollIdField}><label className={styles.fieldLabel} htmlFor="poll-id">投票 ID</label><input id="poll-id" className={styles.input} value={pollId} onChange={(event) => { ++requestRef.current; setPollId(event.target.value); setSnapshot(null); setSyncState("idle"); }} placeholder="从邀请链接打开或粘贴" /><p>活动 API 当前不返回 pollId；不会把活动 ID 当作投票 ID。</p></div>{selectedActivity && !pollId && <StatusCard compact tone="orange" title="还缺投票 ID" body="请使用 host 创建后的 ID，或从邀请链接 `?pollId=…` 打开。" />}{isHost && !snapshot && activityId && <section className={styles.sideBlock}><span className={styles.index}>HOST / NEW POLL</span><h2>创建一张正式投票</h2><form className={styles.form} onSubmit={createPoll}><TextField label="标题" value={pollDraft.title} onChange={(value) => setPollDraft({ ...pollDraft, title: value })} required /><TextAreaField label="说明" value={pollDraft.description} onChange={(value) => setPollDraft({ ...pollDraft, description: value })} /><label className={styles.checkbox}><input type="checkbox" checked={pollDraft.hostEligible} onChange={(event) => setPollDraft({ ...pollDraft, hostEligible: event.target.checked })} />主持人可投票</label><label className={styles.checkbox}><input type="checkbox" checked={pollDraft.allowSelfVote} onChange={(event) => setPollDraft({ ...pollDraft, allowSelfVote: event.target.checked })} />允许提交者自投</label><label className={styles.fieldLabel}>结果规则<select className={styles.select} value={pollDraft.resultMode} onChange={(event) => setPollDraft({ ...pollDraft, resultMode: event.target.value as ResultMode })}><option value="hidden">hidden · 只确认已记录</option><option value="live">live · 开放中显示</option><option value="final">final · 关闭后显示</option></select></label><button className={styles.yellowButton} type="submit" disabled={Boolean(busyAction)}>创建 draft</button></form></section>}</aside><main className={styles.main}>{snapshot ? <SnapshotView snapshot={snapshot} options={options} resultLabel={resultLabel} isHost={Boolean(isHost)} busyAction={busyAction} editDraft={editDraft} setEditDraft={setEditDraft} optionDraft={optionDraft} setOptionDraft={setOptionDraft} voidDraft={voidDraft} setVoidDraft={setVoidDraft} onSave={savePoll} onCreateOption={createOption} onVote={castVote} onOpen={() => void changePollState("open")} onClose={() => void changePollState("close")} onStartVoid={(voteId) => setVoidDraft({ voteId, reason: "" })} onVoid={() => void voidVote()} writeMessage={writeMessage} /> : <EmptyState activity={selectedActivity} syncState={syncState} message={message} onRetry={() => void loadSnapshot()} />}</main></div></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className={styles.page}><div className={styles.shell}><p className={styles.smallNote}>服务端 session 与权限检查</p>{children}</div></main>; }
function IdentityCard({ user, activity, onRelogin, busy }: { user: PublicUser; activity: Activity | null; onRelogin: () => void; busy: boolean }) { const role = activity?.role === "host" ? "主持人" : activity ? "协作者" : "未选择活动"; const scope = activity?.role === "host" ? "可创建、开放和关闭本活动投票" : activity ? "可参与受邀活动；管理权限由服务端限制" : "选择活动后显示活动内权限"; return <aside className={styles.identityCard} aria-label="当前身份"><div className={styles.identityHead}><span className={styles.liveDot} aria-hidden="true" /><span className={styles.index}>CURRENT IDENTITY</span></div><strong>{user.loginId}</strong><div className={styles.identityRole}><span>当前角色</span><b>{role}</b></div><p>{scope}</p><button className={styles.identityAction} type="button" onClick={onRelogin} disabled={busy}>{busy ? "正在退出…" : "退出并重新登录 ↗"}</button></aside>; }
function SnapshotView({ snapshot, options, resultLabel, isHost, busyAction, editDraft, setEditDraft, optionDraft, setOptionDraft, voidDraft, setVoidDraft, onSave, onCreateOption, onVote, onOpen, onClose, onStartVoid, onVoid, writeMessage }: { snapshot: Snapshot; options: Option[]; resultLabel: string; isHost: boolean; busyAction: string | null; editDraft: { title: string; description: string; resultMode: ResultMode; hostEligible: boolean; allowSelfVote: boolean }; setEditDraft: (value: typeof editDraft) => void; optionDraft: { title: string; description: string; link: string }; setOptionDraft: (value: typeof optionDraft) => void; voidDraft: { voteId: string; reason: string } | null; setVoidDraft: (value: { voteId: string; reason: string } | null) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onCreateOption: (event: FormEvent<HTMLFormElement>) => void; onVote: (optionId: string) => Promise<void>; onOpen: () => void; onClose: () => void; onStartVoid: (voteId: string) => void; onVoid: () => void; writeMessage: string }) {
  return <><PollHeader snapshot={snapshot} resultLabel={resultLabel} isHost={isHost} onOpen={onOpen} onClose={onClose} /><div className={styles.contentGrid}><section><div className={styles.sectionHeading}><span className={styles.index}>02 / ENTRIES</span><span className={styles.miniLabel}>{options.length} 个候选项</span></div>{options.length ? <div className={styles.optionGrid}>{options.map((option, index) => <OptionCard key={option.id} option={option} index={index} result={resultFor(snapshot, option.id)} snapshot={snapshot} onVote={() => void onVote(option.id)} isHost={isHost} onVoid={onStartVoid} />)}</div> : <div className={styles.emptyPaper}><strong>还没有候选项。</strong><span>{isHost && snapshot.poll.status === "draft" ? "在右侧添加第一张作品纸片。" : "等待 host 添加候选项；没有显示假数据。"}</span></div>}</section>{isHost && <aside className={styles.hostRail}><HostControls snapshot={snapshot} editDraft={editDraft} setEditDraft={setEditDraft} onSave={onSave} optionDraft={optionDraft} setOptionDraft={setOptionDraft} onCreateOption={onCreateOption} voidDraft={voidDraft} setVoidDraft={setVoidDraft} onVoid={onVoid} busyAction={busyAction} /></aside>}</div>{writeMessage && <p className={styles.writeMessage} role="status" aria-live="polite">{writeMessage}</p>}</>;
}
function StatusCard({ tone, title, body, compact = false }: { tone: "blue" | "orange" | "pink"; title: string; body: string; compact?: boolean }) { return <div className={`${styles.statusCard} ${styles[tone]} ${compact ? styles.compact : ""}`} role="status"><strong>{title}</strong><span>{body}</span></div>; }
function SyncBadge({ state, lastSyncedAt }: { state: SyncState; lastSyncedAt: string | null }) { const labels = { idle: "等待同步", syncing: "同步中", synced: "已同步", failed: "同步失败 · 数据可能过期" }; return <div className={`${styles.sync} ${styles[`sync${state}`]}`} aria-live="polite"><span />{labels[state]}{state === "synced" && lastSyncedAt ? ` · ${new Date(lastSyncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>; }
function EmptyState({ activity, syncState, message, onRetry }: { activity: Activity | null; syncState: SyncState; message: string; onRetry: () => void }) { return <div className={styles.emptyState}><div className={styles.emptyStamp}>{syncState === "syncing" ? "SYNC" : "WAIT"}</div><span className={styles.index}>03 / SNAPSHOT</span><h2>{activity ? "投票还没有打开" : "先选择一个活动"}</h2><p>{activity ? message || "选择投票 ID 后，页面会读取服务端 snapshot。" : "正式活动会出现在左侧。普通成员不会看到 host 管理控件。"}</p>{syncState === "failed" && <button className={styles.outlineButton} type="button" onClick={onRetry}>重试读取投票</button>}</div>; }
function PollHeader({ snapshot, resultLabel, isHost, onOpen, onClose }: { snapshot: Snapshot; resultLabel: string; isHost: boolean; onOpen: () => void; onClose: () => void }) { const { poll } = snapshot; return <section className={styles.pollHeader}><div><div className={styles.pollMeta}><span className={`${styles.statePill} ${styles[`state${poll.status}`]}`}>{poll.status === "draft" ? "草稿" : poll.status === "open" ? "开放中" : "已关闭"}</span><span className={styles.rulePill}>{poll.choice_mode} · {resultLabel}</span></div><h2>{poll.title}</h2><p>{poll.description || "这项投票没有额外说明。"}</p></div><div className={styles.pollActions}>{isHost && poll.status === "draft" && <button className={styles.yellowButton} type="button" onClick={onOpen}>开放投票</button>}{isHost && poll.status === "open" && <button className={styles.outlineButton} type="button" onClick={onClose}>关闭并冻结结果</button>}{poll.status === "open" && <span className={styles.actionHint}>每位合资格成员只能投一票</span>}</div></section>; }
function OptionCard({ option, index, result, snapshot, onVote, isHost, onVoid }: { option: Option; index: number; result: Result; snapshot: Snapshot; onVote: () => void; isHost: boolean; onVoid: (voteId: string) => void }) { const selected = snapshot.viewerVote?.optionId === option.id; const canVote = snapshot.poll.status === "open" && !snapshot.viewerVote; const countLabel = result.count === null ? (result.recordedForViewer || selected ? "你的投票已记录" : "票数隐藏") : `${result.count} 票`; return <article className={`${styles.optionCard} ${selected ? styles.selected : ""}`}><div className={styles.optionTop}><span className={styles.cardNumber}>0{index + 1}</span><span className={`${styles.optionStatus} ${option.status === "published" ? styles.published : styles.withdrawn}`}>{option.status === "published" ? "已发布" : "已撤回"}</span></div><h3>{option.title}</h3><p>{option.description || "没有候选项说明。"}</p>{option.link && <a href={option.link} target="_blank" rel="noreferrer">查看作品链接 ↗</a>}<div className={styles.cardFooter}><div><strong>{countLabel}</strong><span>{selected ? " · 当前选择" : result.count === null ? " · 规则未公开计数" : " · 服务端有效结果"}</span></div><div className={styles.cardActions}>{canVote && <button className={styles.yellowButton} type="button" onClick={onVote}>投给这项</button>}{selected && <span className={styles.recorded}>✓ 已投</span>}{isHost && snapshot.viewerVote && <button className={styles.textButton} type="button" onClick={() => onVoid(snapshot.viewerVote!.voteId)}>作废当前票</button>}</div></div></article>; }
function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className={styles.fieldLabel}>{label}<input className={styles.input} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>; }
function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={styles.fieldLabel}>{label}<textarea className={styles.textarea} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function HostControls({ snapshot, editDraft, setEditDraft, onSave, optionDraft, setOptionDraft, onCreateOption, voidDraft, setVoidDraft, onVoid, busyAction }: { snapshot: Snapshot; editDraft: { title: string; description: string; resultMode: ResultMode; hostEligible: boolean; allowSelfVote: boolean }; setEditDraft: (value: typeof editDraft) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; optionDraft: { title: string; description: string; link: string }; setOptionDraft: (value: typeof optionDraft) => void; onCreateOption: (event: FormEvent<HTMLFormElement>) => void; voidDraft: { voteId: string; reason: string } | null; setVoidDraft: (value: { voteId: string; reason: string } | null) => void; onVoid: () => void; busyAction: string | null }) { const canEdit = snapshot.poll.status === "draft"; return <div className={styles.hostControls}><div className={styles.sectionHeading}><span className={styles.index}>HOST / CONTROL</span><span className={styles.miniLabel}>服务端仍会复核权限</span></div>{canEdit && <form className={styles.hostForm} onSubmit={onSave}><h3>Draft 设置</h3><TextField label="标题" value={editDraft.title} onChange={(value) => setEditDraft({ ...editDraft, title: value })} required /><TextAreaField label="说明" value={editDraft.description} onChange={(value) => setEditDraft({ ...editDraft, description: value })} /><label className={styles.fieldLabel}>结果规则<select className={styles.select} value={editDraft.resultMode} onChange={(event) => setEditDraft({ ...editDraft, resultMode: event.target.value as ResultMode })}><option value="hidden">hidden · 只确认已记录</option><option value="live">live · 开放中显示</option><option value="final">final · 关闭后显示</option></select></label><button className={styles.outlineButton} type="submit" disabled={Boolean(busyAction)}>保存 draft</button></form>} {canEdit && <form className={styles.hostForm} onSubmit={onCreateOption}><h3>添加候选项</h3><TextField label="作品标题" value={optionDraft.title} onChange={(value) => setOptionDraft({ ...optionDraft, title: value })} required /><TextAreaField label="说明" value={optionDraft.description} onChange={(value) => setOptionDraft({ ...optionDraft, description: value })} /><TextField label="HTTPS 链接（可选）" value={optionDraft.link} onChange={(value) => setOptionDraft({ ...optionDraft, link: value })} /><button className={styles.yellowButton} type="submit" disabled={Boolean(busyAction)}>加入作品墙</button></form>} {voidDraft && <form className={styles.hostForm} onSubmit={(event) => { event.preventDefault(); onVoid(); }}><h3>作废当前投票</h3><p className={styles.dangerCopy}>作废会保留记录和审计，不会释放成员的投票资格。</p><TextAreaField label="作废原因（必填）" value={voidDraft.reason} onChange={(value) => setVoidDraft({ ...voidDraft, reason: value })} /><div className={styles.formActions}><button className={styles.outlineButton} type="button" onClick={() => setVoidDraft(null)}>取消</button><button className={styles.dangerButton} type="submit">确认作废</button></div></form>} {!canEdit && !voidDraft && <p className={styles.muted}>投票已开放或关闭，draft 规则与候选项已锁定。作废票需要先从投票卡片发起，并填写原因。</p>}</div>; }
