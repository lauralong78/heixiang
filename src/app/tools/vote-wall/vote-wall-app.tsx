"use client";

import { useEffect, useRef, useState } from "react";

import {
  VOTE_WALL_STORAGE_KEY,
  addArtwork,
  castVote,
  closeActivity,
  createEmptyData,
  createId,
  createSettings,
  eligibility,
  makeEnvelope,
  parseBackupText,
  resultFor,
  validateHttpsUrl,
  validateSnapshot,
  voidVote,
  type ResultMode,
  type VoteWallArtwork,
  type VoteWallData,
  type VoteWallSnapshot,
} from "@/lib/vote-wall/vote-wall";
import { LOCAL_DEMO_MODE, type ActivityParticipant, type LocalActivity, type LocalCommandMeta, type LocalIdentity } from "@/lib/contracts/local-tools";

import styles from "./vote-wall.module.css";

const EMPTY_SNAPSHOT: VoteWallSnapshot = { identities: [], activities: [], participants: [], activeIdentityId: null, data: createEmptyData() };
const now = () => new Date().toISOString();

export function VoteWallApp() {
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<VoteWallSnapshot>(EMPTY_SNAPSHOT);
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState({ title: "", hostName: "" });
  const [identityName, setIdentityName] = useState("");
  const [identityRole, setIdentityRole] = useState<"participant" | "viewer">("participant");
  const [artDraft, setArtDraft] = useState({ title: "", description: "", link: "" });
  const [voidDraft, setVoidDraft] = useState<{ voteId: string; reason: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(VOTE_WALL_STORAGE_KEY);
        if (raw) setSnapshot(validateSnapshot(JSON.parse(raw)));
      } catch { setMessage("本地投票墙数据无效，已使用空白演示；可导入有效 JSON 恢复。"); }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { if (hydrated) { try { window.localStorage.setItem(VOTE_WALL_STORAGE_KEY, JSON.stringify(snapshot)); } catch { window.setTimeout(() => setMessage("本地存储不可用，请立即导出 JSON 备份。"), 0); } } }, [snapshot, hydrated]);

  const activity = snapshot.activities.find((item) => item.tool === "vote-wall");
  const settings = activity && snapshot.data.settings.find((item) => item.activityId === activity.id);
  const activeIdentity = snapshot.identities.find((item) => item.id === snapshot.activeIdentityId) ?? null;
  const participants = activity ? snapshot.participants.filter((item) => item.activityId === activity.id) : [];
  const isHost = activity && activeIdentity ? activity.ownerIdentityId === activeIdentity.id : false;
  const canEditRules = Boolean(isHost && activity?.status === "draft" && settings);

  function setCurrent(next: VoteWallSnapshot, success?: string) { setSnapshot(validateSnapshot(next)); if (success) setMessage(success); }
  function createActivity(event: React.FormEvent) {
    event.preventDefault();
    const title = setup.title.trim().replace(/\s+/g, " "); const hostName = setup.hostName.trim().replace(/\s+/g, " ");
    if (!title || !hostName) return setMessage("活动标题和主持人名称不能为空。");
    const time = now(); const host = { id: createId("identity"), displayName: hostName, status: "active" as const, createdAt: time, updatedAt: time, deletedAt: null };
    const created: LocalActivity = { id: createId("activity"), tool: "vote-wall", title, ownerIdentityId: host.id, status: "draft", demoMode: LOCAL_DEMO_MODE, createdAt: time, updatedAt: time, deletedAt: null };
    setCurrent({ identities: [host], activities: [created], participants: [], activeIdentityId: host.id, data: { ...createEmptyData(), settings: [createSettings(created.id)] } }, "活动已创建。规则仍在 draft 阶段，可继续调整。");
  }
  function addIdentity(event: React.FormEvent) {
    event.preventDefault(); if (!activity) return; const label = identityName.trim().replace(/\s+/g, " "); if (!label) return setMessage("身份名称不能为空。");
    const time = now(); const identity: LocalIdentity = { id: createId("identity"), displayName: label, status: "active", createdAt: time, updatedAt: time, deletedAt: null };
    const participant: ActivityParticipant = { id: createId("participant"), activityId: activity.id, identityId: identity.id, role: identityRole, status: "active", visibility: "public", profile: { nickname: label, skills: [], interests: [], bio: "" }, joinedAt: time, updatedAt: time, withdrawnAt: null, deletedAt: null };
    setCurrent({ ...snapshot, identities: [...snapshot.identities, identity], participants: [...snapshot.participants, participant], activeIdentityId: identity.id }, `已添加 ${identityRole === "participant" ? "参与者" : "观察者"}“${label}”，当前已切换到该身份。`); setIdentityName("");
  }
  function commandMeta(): LocalCommandMeta { return { operationId: createId("op"), actorIdentityId: snapshot.activeIdentityId ?? "", issuedAt: now() }; }
  function updateRules(field: "hostEligible" | "allowSelfVote" | "resultMode", value: boolean | ResultMode) {
    if (!settings || !canEditRules) return; setCurrent({ ...snapshot, data: { ...snapshot.data, settings: snapshot.data.settings.map((item) => item.activityId === activity?.id ? { ...item, [field]: value } : item) } }, "规则已保存。规则在 open 后锁定。");
  }
  function openActivity() { if (!activity || !isHost || activity.status !== "draft") return; setCurrent({ ...snapshot, activities: snapshot.activities.map((item) => item.id === activity.id ? { ...item, status: "open", updatedAt: now() } : item) }, "活动已 open，规则已锁定。现在可投票。"); }
  function submitArtwork(event: React.FormEvent) {
    event.preventDefault(); if (!activity || !isHost || activity.status !== "draft") return setMessage("只有主持人可在 draft 阶段管理作品。");
    try { setCurrent({ ...snapshot, data: addArtwork(snapshot.data, { activityId: activity.id, submitterIdentityId: snapshot.activeIdentityId ?? "", title: artDraft.title, description: artDraft.description, link: artDraft.link }) }, "作品已发布。"); setArtDraft({ title: "", description: "", link: "" }); } catch (error) { setMessage(errorMessage(error)); }
  }
  function changeArtwork(artwork: VoteWallArtwork, status: "withdrawn" | "removed") { if (!isHost || activity?.status !== "draft") return; setCurrent({ ...snapshot, data: { ...snapshot.data, artworks: snapshot.data.artworks.map((item) => item.id === artwork.id ? { ...item, status, updatedAt: now() } : item) } }, `作品已标记为 ${status === "withdrawn" ? "撤回" : "移除"}。`); }
  function vote(artworkId: string) {
    if (!activity || !settings || !snapshot.activeIdentityId) return setMessage("请先切换到活动身份。");
    try { const outcome = castVote(snapshot, activity.id, artworkId, commandMeta()); setCurrent(outcome.snapshot, outcome.result.message); } catch (error) { setMessage(errorMessage(error)); }
  }
  function close() { if (!activity || !isHost || !window.confirm("关闭后作品、投票和结果将冻结，确定继续吗？")) return; try { setCurrent(closeActivity(snapshot, activity.id, "主持人确认关闭", commandMeta()), "活动已关闭，结果已冻结。"); } catch (error) { setMessage(errorMessage(error)); } }
  function voidOne(voteId: string) { if (!activity || !voidDraft) return; try { setCurrent(voidVote(snapshot, activity.id, voteId, voidDraft.reason, commandMeta()), "投票已作废，审计记录已保留。"); setVoidDraft(null); } catch (error) { setMessage(errorMessage(error)); } }
  function exportBackup() { const blob = new Blob([JSON.stringify(makeEnvelope(snapshot), null, 2)], { type: "application/json" }); download(blob, `${activity?.title ?? "vote-wall"}-backup.json`); setMessage("本地 JSON 备份已下载。"); }
  function exportResults() { if (!activity || !settings) return; const artworks = snapshot.data.artworks.filter((item) => item.activityId === activity.id); const payload = { kind: "hackkit-vote-wall-results", exportedAt: now(), activityId: activity.id, activityTitle: activity.title, demoMode: LOCAL_DEMO_MODE, statisticAt: now(), resultMode: settings.resultMode, voidIncluded: false, results: artworks.map((artwork) => ({ artworkId: artwork.id, title: artwork.title, ...resultFor(snapshot, activity.id, artwork.id) })) }; download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${activity.title}-results.json`); setMessage("结果导出已下载，文件已注明统计时间、本机演示和 void 规则。"); }
  async function importFile(file: File | undefined) { if (!file) return; try { if (file.size > 512 * 1024) throw new Error("本地备份不能超过 512 KB。"); const parsed = parseBackupText(await file.text()); if (activity && !window.confirm("导入会覆盖当前本机投票墙，确定继续吗？")) return; setCurrent(parsed, "已恢复本地投票墙。"); } catch (error) { setMessage(errorMessage(error)); } finally { if (importRef.current) importRef.current.value = ""; } }

  if (!hydrated) return <main className={styles.page}><div className={styles.shell}>正在读取本机演示数据…</div></main>;
  if (!activity) return <main className={styles.page}><div className={styles.shell}><header className={styles.hero}><div><div className={styles.eyebrow}>HK-212 / LOCAL DEMO</div><h1>把现场的选择，<br />投到墙上。</h1><p>单选投票墙：主持人配置活动与作品，参与者在同一浏览器切换身份并投票。</p></div><div className={styles.badge}>同一浏览器本机演示<br />不是真实账号 / 不跨设备共享 / 不提供线上安全授权</div></header><section className={styles.panel} style={{ maxWidth: 620, margin: "38px auto 0" }}><h2>创建投票活动</h2><form className={styles.form} onSubmit={createActivity}><label>活动标题<input className={styles.input} value={setup.title} onChange={(e) => setSetup({ ...setup, title: e.target.value })} maxLength={120} placeholder="例如：黑客松 Demo Day" required /></label><label>主持人显示名<input className={styles.input} value={setup.hostName} onChange={(e) => setSetup({ ...setup, hostName: e.target.value })} maxLength={80} placeholder="例如：小林" required /></label><button className={`${styles.button} ${styles.primary}`} type="submit">创建本机活动 →</button></form><p className={styles.message}>{message}</p><label className={styles.button}>导入本地 JSON<input ref={importRef} className={styles.srOnly} type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} /></label></section></div></main>;

  const artworks = snapshot.data.artworks.filter((item) => item.activityId === activity.id && item.status !== "removed");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.hero}><div><div className={styles.eyebrow}>HK-212 / {activity.status.toUpperCase()} / {settings?.resultMode.toUpperCase()}</div><h1>{activity.title}</h1><p>当前身份：<b>{activeIdentity?.displayName ?? "未选择"}</b>。本页所有身份、作品、投票和审计都保存在当前浏览器。</p></div><div className={styles.badge}>同一浏览器本机演示<br />不是真实账号 / 不跨设备共享 / 不提供线上安全授权</div></header><div className={styles.toolbar}><label>切换演示身份<select className={styles.select} value={snapshot.activeIdentityId ?? ""} onChange={(e) => setSnapshot({ ...snapshot, activeIdentityId: e.target.value })}><option value="">请选择</option>{snapshot.identities.map((item) => <option key={item.id} value={item.id}>{item.displayName}{item.id === activity.ownerIdentityId ? " · host" : ` · ${participants.find((p) => p.identityId === item.id)?.role ?? "inactive"}`}</option>)}</select></label><button className={styles.button} type="button" onClick={exportBackup}>导出备份</button><button className={styles.button} type="button" onClick={exportResults}>导出结果</button><label className={styles.button}>导入 JSON<input ref={importRef} className={styles.srOnly} type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} /></label>{isHost && activity.status !== "closed" && <button className={`${styles.button} ${styles.danger}`} type="button" onClick={close}>关闭活动</button>}</div><p className={styles.message} role="status" aria-live="polite">{message}</p><div className={styles.notice}>规则：single-choice · 主持人{settings?.hostEligible ? "可投票" : "默认不可投票"} · {settings?.allowSelfVote ? "允许自投" : "不允许自投"} · 结果模式 {settings?.resultMode}。open 后规则锁定；closed 后所有作品、投票和结果冻结。</div><div className={styles.layout}><aside><section className={styles.panel}><h2>演示身份</h2><form className={styles.form} onSubmit={addIdentity}><label>新身份名称<input className={styles.input} value={identityName} onChange={(e) => setIdentityName(e.target.value)} placeholder="参与者或观察者" maxLength={80} /></label><label>身份类型<select className={styles.select} value={identityRole} onChange={(e) => setIdentityRole(e.target.value as typeof identityRole)}><option value="participant">participant · 可按规则投票</option><option value="viewer">viewer · 只读</option></select></label><button className={styles.button} type="submit">添加并切换身份</button></form><div className={styles.identityList}>{participants.map((participant) => { const identity = snapshot.identities.find((item) => item.id === participant.identityId); return <div className={styles.identity} key={participant.id}><span>{identity?.displayName}<small>{participant.role} · active</small></span></div>; })}</div></section><section className={styles.panel}><h2>主持人规则</h2>{isHost ? <div className={styles.rule}><label className={styles.checkbox}><input type="checkbox" checked={settings?.hostEligible ?? false} disabled={!canEditRules} onChange={(e) => updateRules("hostEligible", e.target.checked)} />主持人可投票</label><label className={styles.checkbox}><input type="checkbox" checked={settings?.allowSelfVote ?? false} disabled={!canEditRules} onChange={(e) => updateRules("allowSelfVote", e.target.checked)} />允许提交者给自己的作品投票</label><label>结果模式<select className={styles.select} value={settings?.resultMode ?? "hidden"} disabled={!canEditRules} onChange={(e) => updateRules("resultMode", e.target.value as ResultMode)}><option value="hidden">hidden · 只确认已记录</option><option value="live">live · 实时计数</option><option value="final">final · closed 后显示</option></select></label>{activity.status === "draft" && <button className={`${styles.button} ${styles.primary}`} type="button" onClick={openActivity}>开放投票并锁定规则</button>}{activity.status !== "draft" && <p className={styles.muted}>规则已锁定，当前状态：{activity.status}。</p>}</div> : <p className={styles.muted}>切换到 host 身份后才能查看或修改活动规则。</p>}</section>{isHost && activity.status === "draft" && <section className={styles.panel}><h2>添加作品</h2><form className={styles.form} onSubmit={submitArtwork}><label>标题<input className={styles.input} value={artDraft.title} onChange={(e) => setArtDraft({ ...artDraft, title: e.target.value })} maxLength={120} required /></label><label>说明<textarea className={styles.textarea} value={artDraft.description} onChange={(e) => setArtDraft({ ...artDraft, description: e.target.value })} maxLength={1000} /></label><label>HTTPS 链接（可选）<input className={styles.input} value={artDraft.link} onChange={(e) => setArtDraft({ ...artDraft, link: e.target.value })} placeholder="https://…" /></label><button className={styles.button} type="submit">发布作品</button></form></section>}</aside><section><div className={styles.panel}><h2>作品墙 <span className={styles.mono}>{artworks.length} ENTRIES</span></h2>{artworks.length === 0 ? <div className={styles.empty}>暂无作品。主持人可在 draft 阶段添加。</div> : <div className={styles.artworkList}>{artworks.map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} snapshot={snapshot} activity={activity} settings={settings} activeIdentity={activeIdentity} isHost={Boolean(isHost)} onVote={() => vote(artwork.id)} onChangeStatus={(status) => changeArtwork(artwork, status)} onVoid={(voteId) => setVoidDraft({ voteId, reason: "" })} voidDraft={voidDraft} setVoidDraft={setVoidDraft} onConfirmVoid={voidOne} />)}</div>}</div></section></div></div></main>;
}

function ArtworkCard({ artwork, snapshot, activity, settings, activeIdentity, isHost, onVote, onChangeStatus, onVoid, voidDraft, setVoidDraft, onConfirmVoid }: { artwork: VoteWallArtwork; snapshot: VoteWallSnapshot; activity: LocalActivity; settings: VoteWallData["settings"][number] | undefined; activeIdentity: LocalIdentity | null; isHost: boolean; onVote: () => void; onChangeStatus: (status: "withdrawn" | "removed") => void; onVoid: (voteId: string) => void; voidDraft: { voteId: string; reason: string } | null; setVoidDraft: React.Dispatch<React.SetStateAction<{ voteId: string; reason: string } | null>>; onConfirmVoid: (voteId: string) => void }) {
  const summary = resultFor(snapshot, activity.id, artwork.id); const ownVote = activeIdentity && snapshot.data.votes.find((vote) => vote.activityId === activity.id && vote.voterIdentityId === activeIdentity.id); const votes = snapshot.data.votes.filter((vote) => vote.activityId === activity.id && vote.artworkId === artwork.id);
  const check = activeIdentity && settings ? eligibility(activity, activeIdentity.id, snapshot.participants, settings, artwork) : null;
  return <article className={styles.artwork}><div><h3>{artwork.title}</h3>{artwork.description && <p>{artwork.description}</p>}{artwork.link && <p><a href={validateHttpsUrl(artwork.link) ?? undefined} target="_blank" rel="noreferrer">打开 HTTPS 链接 ↗</a></p>}<p className={styles.status}>状态：{artwork.status} · 提交者已匿名化规则由本机身份决定</p></div><div className={styles.stats}><strong>{summary.count === null ? "—" : summary.count}</strong><span>{summary.count === null ? (summary.recorded ? "已记录" : "票数隐藏") : "有效票"}</span>{summary.voidCount > 0 && <span>void {summary.voidCount}</span>}</div><div className={styles.artworkActions}><button className={`${styles.button} ${styles.primary}`} disabled={Boolean(ownVote) || !check?.ok || activity.status === "closed"} onClick={onVote}>{ownVote ? "已投票" : check?.ok ? "投给它" : check?.message ?? "不可投票"}</button>{isHost && activity.status === "draft" && <span className={styles.actions}><button className={styles.button} onClick={() => onChangeStatus("withdrawn")}>撤回</button><button className={`${styles.button} ${styles.danger}`} onClick={() => onChangeStatus("removed")}>移除</button></span>}{isHost && (activity.status === "open" || activity.status === "paused") && votes.filter((vote) => vote.status === "active").map((vote) => <span key={vote.id} className={styles.actions}>{voidDraft?.voteId === vote.id ? <><input className={styles.input} value={voidDraft.reason} onChange={(e) => setVoidDraft({ voteId: vote.id, reason: e.target.value })} placeholder="作废原因" /><button className={`${styles.button} ${styles.danger}`} onClick={() => onConfirmVoid(vote.id)}>确认 void</button></> : <button className={styles.button} onClick={() => onVoid(vote.id)}>作废这票</button>}</span>)}</div></article>;
}

function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80); document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作失败，请重试。"; }
