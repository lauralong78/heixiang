"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type ActivityParticipant, type LocalActivity, type LocalIdentity, type LocalParticipantProfile } from "@/lib/contracts/local-tools";
import { buildSuggestions, createId, EMPTY_TEAM_MATCH_DATA, anonymizeParticipant, expirePending, respondToInvitation, sendInvitation, splitTags, TEAM_MATCH_STORAGE_KEY, withdrawParticipant, type InvitationStatus } from "@/lib/team-match/team-match";
import { EMPTY_TEAM_MATCH_SNAPSHOT, parseSnapshotText, readStoredSnapshot, serializeSnapshot, type TeamMatchSnapshot } from "@/lib/team-match/storage";
import styles from "./team-match.module.css";

const now = () => new Date().toISOString();
const emptyProfile: LocalParticipantProfile = { nickname: "", skills: [], interests: [], bio: "" };
const labels: Record<InvitationStatus, string> = { pending: "待处理", accepted: "已接受", rejected: "已拒绝", withdrawn: "已撤回", expired: "已过期" };

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作失败，请重试。"; }
function nameOf(identity: LocalIdentity | undefined, fallback = "未知身份") { return identity?.displayName ?? fallback; }

export function TeamMatchWorkspace() {
  const [snapshot, setSnapshot] = useState<TeamMatchSnapshot>(EMPTY_TEAM_MATCH_SNAPSHOT);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("资料只保存在当前浏览器。");
  const [error, setError] = useState("");
  const [identityName, setIdentityName] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [joinRole, setJoinRole] = useState<"participant" | "viewer">("participant");
  const [profileDraft, setProfileDraft] = useState<LocalParticipantProfile>(emptyProfile);
  const [visibility, setVisibility] = useState<ActivityParticipant["visibility"]>("public");
  const [editingProfile, setEditingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(TEAM_MATCH_STORAGE_KEY);
    queueMicrotask(() => { const result = readStoredSnapshot(saved); setSnapshot(result.snapshot); if (result.warning) setMessage(result.warning); setHydrated(true); });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(TEAM_MATCH_STORAGE_KEY, serializeSnapshot(snapshot)); }
    catch { window.setTimeout(() => setMessage("浏览器未能保存修改，请立即导出 JSON 备份。"), 0); }
  }, [hydrated, snapshot]);

  const activity = snapshot.activities.find((item) => item.tool === "team-match" && item.status !== "deleted");
  const activeIdentity = snapshot.identities.find((item) => item.id === snapshot.activeIdentityId && item.status === "active");
  const role = activity && activeIdentity ? (activeIdentity.id === activity.ownerIdentityId ? "host" : snapshot.participants.find((item) => item.activityId === activity.id && item.identityId === activeIdentity.id && item.status === "active")?.role ?? null) : null;
  const currentParticipant = activity && activeIdentity ? snapshot.participants.find((item) => item.activityId === activity.id && item.identityId === activeIdentity.id && item.status === "active" && item.role === "participant") : undefined;
  const activeParticipants = activity ? snapshot.participants.filter((item) => item.activityId === activity.id && item.status === "active") : [];
  const suggestions = activity && currentParticipant ? buildSuggestions(activity.id, currentParticipant, activeParticipants, snapshot.data) : [];
  const identityMap = useMemo(() => new Map(snapshot.identities.map((item) => [item.id, item])), [snapshot.identities]);

  function commit(next: TeamMatchSnapshot, notice: string) { setSnapshot(next); setError(""); setMessage(notice); }
  function createIdentity(event: FormEvent) {
    event.preventDefault(); const clean = identityName.trim(); if (!clean) return setError("本地身份名称不能为空。");
    if (snapshot.identities.some((item) => item.displayName.toLocaleLowerCase("zh-CN") === clean.toLocaleLowerCase("zh-CN") && item.status === "active")) return setError("本地身份名称不能重复。");
    const stamp = now(); const identity: LocalIdentity = { id: createId("identity"), displayName: clean, status: "active", createdAt: stamp, updatedAt: stamp, deletedAt: null };
    setSnapshot((current) => ({ ...current, identities: [...current.identities, identity], activeIdentityId: identity.id })); setIdentityName(""); setMessage(`已创建并切换到本地身份“${clean}”。`); setError("");
  }
  function createActivity(event: FormEvent) {
    event.preventDefault(); if (!activeIdentity) return setError("先创建或切换到一个本地身份。"); const title = activityTitle.trim(); if (!title) return setError("活动名称不能为空。");
    const stamp = now(); const created: LocalActivity = { id: createId("activity"), tool: "team-match", title, ownerIdentityId: activeIdentity.id, status: "open", demoMode: "same-browser-demo", createdAt: stamp, updatedAt: stamp, deletedAt: null };
    commit({ ...snapshot, activities: [...snapshot.activities, created], data: EMPTY_TEAM_MATCH_DATA }, `活动“${title}”已创建并开放。`); setActivityTitle("");
  }
  function joinActivity(event: FormEvent) {
    event.preventDefault(); if (!activity || !activeIdentity) return setError("先创建活动并选择本地身份。"); if (activeIdentity.id === activity.ownerIdentityId) return setError("主持人身份不需要重复加入参与名单。");
    const stamp = now(); const participant: ActivityParticipant = { id: createId("participant"), activityId: activity.id, identityId: activeIdentity.id, role: joinRole, status: "active", visibility: "public", profile: { ...emptyProfile, nickname: activeIdentity.displayName }, joinedAt: stamp, updatedAt: stamp, withdrawnAt: null, deletedAt: null };
    commit({ ...snapshot, participants: [...snapshot.participants, participant] }, joinRole === "viewer" ? "已加入只读观察者名单。" : "已加入参与者名单，请填写自愿公开的资料。");
  }
  function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!activity || !currentParticipant || !activeIdentity || role !== "participant") return setError("当前身份没有编辑参与资料的权限。");
    const nickname = profileDraft.nickname.trim(); if (!nickname) return setError("昵称不能为空。");
    const profile = { ...profileDraft, nickname, skills: splitTags(profileDraft.skills.join(",")), interests: splitTags(profileDraft.interests.join(",")), bio: profileDraft.bio.trim() };
    commit({ ...snapshot, participants: snapshot.participants.map((item) => item.id === currentParticipant.id ? { ...item, visibility, profile, updatedAt: now() } : item) }, "资料已保存；建议会严格按当前可见字段重新计算。"); setEditingProfile(false);
  }
  function send(toId: string) {
    if (!activity || !currentParticipant || !activeIdentity) return; const target = snapshot.participants.find((item) => item.id === toId); if (!target) return;
    try { const result = sendInvitation(activity, activeIdentity.id, currentParticipant, target, snapshot.participants, snapshot.data, { operationId: createId("op"), actorIdentityId: activeIdentity.id, issuedAt: now() }); commit({ ...snapshot, data: result.data }, result.status === "already-pending" ? "这组参与者已有待处理邀请。" : "邀请已保存到本机记录。"); } catch (e) { setError(errorMessage(e)); }
  }
  function respond(action: "accept" | "reject" | "withdraw", invitationId: string) {
    if (!activity || !activeIdentity) return; try { const result = respondToInvitation(action, activity, activeIdentity.id, invitationId, snapshot.participants, snapshot.data, { operationId: createId("op"), actorIdentityId: activeIdentity.id, issuedAt: now() }); commit({ ...snapshot, data: result.data }, `邀请状态已更新为“${labels[result.status as InvitationStatus] ?? result.status}”。`); } catch (e) { setError(errorMessage(e)); }
  }
  function exitSelf() {
    if (!activity || !currentParticipant || !activeIdentity || !window.confirm("退出后将不再出现在新建议中，待处理邀请会取消，已接受匹配会结束。确定退出？")) return;
    try { const participants = snapshot.participants.map((item) => item.id === currentParticipant.id ? { ...item, status: "withdrawn" as const, withdrawnAt: now(), updatedAt: now() } : item); commit({ ...snapshot, participants, data: withdrawParticipant(activity, activeIdentity.id, currentParticipant, snapshot.data) }, "已退出当前活动。可重新加入，但会生成新的参与记录。"); } catch (e) { setError(errorMessage(e)); }
  }
  function deleteSelf() {
    if (!activity || !currentParticipant || !activeIdentity || !window.confirm("删除资料会清除展示字段，仅保留匿名占位和最小审计记录。确认继续？")) return;
    try { const participants = snapshot.participants.map((item) => item.id === currentParticipant.id ? anonymizeParticipant(item) : item); const base = withdrawParticipant(activity, activeIdentity.id, currentParticipant, snapshot.data); commit({ ...snapshot, participants, data: { ...base, audits: [...base.audits, { id: createId("audit"), action: "participant-deleted", activityId: activity.id, participantId: currentParticipant.id, at: now() }] } }, "资料已删除并匿名化；导入删除前备份可恢复。"); } catch (e) { setError(errorMessage(e)); }
  }
  function closeActivity() {
    if (!activity || role !== "host" || !window.confirm("关闭活动后不能继续创建邀请，pending 邀请会变为已过期。确定关闭？")) return;
    const closed = { ...activity, status: "closed" as const, updatedAt: now() }; commit({ ...snapshot, activities: snapshot.activities.map((item) => item.id === activity.id ? closed : item), data: expirePending(closed, snapshot.data) }, "活动已关闭，待处理邀请已按本机规则过期。");
  }
  function exportBackup() { const text = serializeSnapshot(snapshot); const blob = new Blob([text], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "hackkit-team-match.json"; anchor.click(); URL.revokeObjectURL(url); setMessage("JSON 备份已下载；它不是安全凭证。 "); }
  async function importBackup(file: File | undefined) { if (!file) return; try { const restored = parseSnapshotText(await file.text()); if (snapshot.activities.length && !window.confirm("导入会覆盖当前本地身份、活动、资料和邀请。确定继续？")) return; setSnapshot(restored); setMessage("JSON 备份已完整校验并恢复。"); setError(""); } catch (e) { setError(errorMessage(e)); } finally { if (fileRef.current) fileRef.current.value = ""; } }
  function switchIdentity(id: string) { setSnapshot((current) => ({ ...current, activeIdentityId: id })); setEditingProfile(false); setMessage(`已切换为“${nameOf(identityMap.get(id))}”。`); setError(""); }

  if (!hydrated) return <main className={styles.loading} aria-busy="true">正在读取本机资料…</main>;

  const visibleInvitations = activity && activeIdentity ? snapshot.data.invitations.filter((item) => item.activityId === activity.id && (snapshot.participants.find((p) => p.id === item.fromParticipantId)?.identityId === activeIdentity.id || snapshot.participants.find((p) => p.id === item.toParticipantId)?.identityId === activeIdentity.id)) : [];
  return <main className={styles.page}>
    <header className={styles.topbar}><span>HACKKIT / TEAM MATCH</span><strong>LOCAL ONLY · 无网络请求</strong></header>
    <section className={styles.hero}><div><p className={styles.eyebrow}>HK—211 / VOLUNTARY SIGNALS</p><h1>找到值得<br />聊一轮的人。</h1><p>把自愿填写的技能与兴趣变成可追溯的本地建议。每个字段都有来源，每个邀请都有边界。</p></div><aside className={styles.warning}><strong>本机演示，不支持真实账号、跨设备共享或线上安全授权</strong><span>身份、资料、邀请和匹配记录都能被本机使用者修改。不要填写联系方式、密码、Token 或 API Key。</span></aside></section>
    <section className={styles.shell}>
      <aside>
        <section className={styles.panel}><div className={styles.panelHeader}><h2>本地身份</h2><span>{snapshot.identities.filter((i) => i.status === "active").length} ACTIVE</span></div><div className={styles.panelBody}><form className={styles.inline} onSubmit={createIdentity}><label className={styles.fieldGrid}><span>新建显示名</span><input value={identityName} onChange={(e) => setIdentityName(e.target.value)} maxLength={80} placeholder="例如：小林" /></label><button type="submit">创建</button></form><p className={styles.subtle}>身份只是本机演示标签，不是登录。请显式切换身份来检查权限。</p><div className={styles.identityList}>{snapshot.identities.filter((i) => i.status === "active").map((identity) => <div className={styles.identityRow} key={identity.id}><div><strong className={identity.id === activeIdentity?.id ? styles.activeIdentity : ""}>{identity.displayName}</strong><small>{identity.id === activeIdentity?.id ? "当前演示身份" : "可切换"}</small></div><button className={styles.miniButton} type="button" onClick={() => switchIdentity(identity.id)} disabled={identity.id === activeIdentity?.id}>切换</button></div>)}</div></div></section>
        {!activity && <section className={styles.panel}><div className={styles.panelHeader}><h2>创建匹配活动</h2><span>HOST</span></div><div className={styles.panelBody}><form className={styles.fieldGrid} onSubmit={createActivity}><label>活动名称<input value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} maxLength={120} placeholder="例如：周五现场配对" /></label><button type="submit" disabled={!activeIdentity}>创建并开放</button></form><p className={styles.subtle}>创建者自动成为主持人。活动不连接账号，也不会发送真实邀请。</p></div></section>}
        {activity && !currentParticipant && activeIdentity?.id !== activity.ownerIdentityId && <section className={styles.panel}><div className={styles.panelHeader}><h2>加入这场活动</h2><span>{activity.status === "open" ? "OPEN" : "CLOSED"}</span></div><div className={styles.panelBody}><form className={styles.fieldGrid} onSubmit={joinActivity}><label>加入身份<select value={joinRole} onChange={(e) => setJoinRole(e.target.value as "participant" | "viewer")}><option value="participant">participant · 参与者</option><option value="viewer">viewer · 只读观察者</option></select></label><button type="submit" disabled={activity.status !== "open"}>加入活动</button></form><p className={styles.subtle}>参与者可以填写资料和发送自己的邀请；观察者只能阅读公开内容。</p></div></section>}
        {currentParticipant && <section className={styles.panel}><div className={styles.panelHeader}><h2>我的资料</h2><span>{currentParticipant.visibility.toUpperCase()}</span></div><div className={styles.panelBody}>{!editingProfile ? <><div className={styles.rosterRow}><div><strong>{currentParticipant.profile.nickname}</strong><small>{currentParticipant.profile.skills.join(" · ") || "未填写技能"}</small></div><button type="button" className={styles.miniButton} onClick={() => { setProfileDraft(currentParticipant.profile); setVisibility(currentParticipant.visibility); setEditingProfile(true); }}>编辑</button></div><p className={styles.subtle}>public 显示简介；limited 隐藏简介；private 不进入公开匹配建议。</p><div className={styles.footerActions}><button type="button" className={styles.miniButton} onClick={exitSelf}>退出活动</button><button type="button" className={`${styles.miniButton} ${styles.danger}`} onClick={deleteSelf}>删除资料</button></div></> : <form className={styles.fieldGrid} onSubmit={saveProfile}><label>昵称<input value={profileDraft.nickname} onChange={(e) => setProfileDraft((p) => ({ ...p, nickname: e.target.value }))} maxLength={80} /></label><label>技能<input value={profileDraft.skills.join(", ")} onChange={(e) => setProfileDraft((p) => ({ ...p, skills: splitTags(e.target.value) }))} placeholder="前端，研究，写作" /></label><label>兴趣<input value={profileDraft.interests.join(", ")} onChange={(e) => setProfileDraft((p) => ({ ...p, interests: splitTags(e.target.value) }))} placeholder="教育，音乐，开源" /></label><label>简介<textarea value={profileDraft.bio} onChange={(e) => setProfileDraft((p) => ({ ...p, bio: e.target.value }))} maxLength={240} placeholder="只写你愿意让 public 成员看到的内容" /></label><label>可见性<select value={visibility} onChange={(e) => setVisibility(e.target.value as ActivityParticipant["visibility"])}><option value="public">public · 昵称、技能、兴趣、简介</option><option value="limited">limited · 昵称、技能、兴趣</option><option value="private">private · 不进入公开建议</option></select></label><div className={styles.inline}><button type="submit">保存资料</button><button type="button" className={styles.miniButton} onClick={() => setEditingProfile(false)}>取消</button></div></form>}</div></section>}
      </aside>
      <section className={styles.panel}>{activity ? <><div className={styles.activityHead}><div><p className={styles.eyebrow}>ACTIVE BOARD / {activity.status.toUpperCase()}</p><h2>{activity.title}</h2><p>当前身份：{nameOf(activeIdentity)} · {role ?? "尚未加入"}</p></div><div className={styles.activityActions}>{role === "host" && <button type="button" onClick={closeActivity} disabled={activity.status !== "open"}>关闭活动</button>}</div></div><div className={styles.roleBar}><span>角色边界：</span><label><select aria-label="当前本地身份" value={snapshot.activeIdentityId ?? ""} onChange={(e) => switchIdentity(e.target.value)}>{snapshot.identities.filter((i) => i.status === "active").map((i) => <option key={i.id} value={i.id}>{i.displayName}</option>)}</select></label><span>{role === "host" ? "主持人可关闭活动并查看公开记录。" : role === "participant" ? "参与者只能管理自己的资料与邀请。" : "观察者只能阅读公开内容。"}</span></div><div className={styles.content}><section><div className={styles.sectionTitle}><h3>匹配建议</h3><span>{suggestions.length} PEOPLE</span></div>{role !== "participant" ? <div className={styles.noticeEmpty}>切换到 active participant 身份，才能生成属于自己的建议。<br />private 资料不会进入公开建议。</div> : suggestions.length === 0 ? <div className={styles.noticeEmpty}>暂无可建议对象。可能是还没有第二位活跃参与者，或现有资料选择了 private / 存在排除关系。</div> : <div className={styles.suggestionGrid}>{suggestions.map((suggestion) => <article className={styles.suggestion} key={suggestion.participantId}><div className={styles.suggestionTop}><h4>{suggestion.nickname}</h4><span className={styles.badge}>{suggestion.visibility}</span></div><div className={styles.tags}>{suggestion.skills.map((tag) => <span className={styles.tag} key={`s-${tag}`}>技能 · {tag}</span>)}{suggestion.interests.map((tag) => <span className={styles.tag} key={`i-${tag}`}>兴趣 · {tag}</span>)}</div>{suggestion.bio && <p className={styles.bio}>{suggestion.bio}</p>}<ul className={styles.evidence}>{suggestion.evidence.map((item) => <li key={item.text}>{item.text}</li>)}</ul><button className={styles.inviteButton} type="button" onClick={() => send(suggestion.participantId)} disabled={activity.status !== "open"}>发送邀请</button></article>)}</div>}</section><section className={styles.inviteSection}><div className={styles.sectionTitle}><h3>我的邀请</h3><span>{visibleInvitations.length} RECORDS</span></div>{visibleInvitations.length === 0 ? <div className={styles.noticeEmpty}>还没有邀请记录。建议由参与者本人发起，接收方才能接受或拒绝。</div> : <div className={styles.inviteList}>{visibleInvitations.map((invitation) => { const sender = snapshot.participants.find((p) => p.id === invitation.fromParticipantId); const receiver = snapshot.participants.find((p) => p.id === invitation.toParticipantId); const incoming = receiver?.identityId === activeIdentity?.id; const outgoing = sender?.identityId === activeIdentity?.id; return <div className={styles.inviteRow} key={invitation.id}><div className={styles.inviteText}><strong>{incoming ? `来自 ${sender?.profile.nickname ?? "已移除"}` : `发给 ${receiver?.profile.nickname ?? "已移除"}`}</strong><span>{new Date(invitation.createdAt).toLocaleString("zh-CN", { hour12: false })} · <em className={styles.status}>{labels[invitation.status]}</em></span></div><div className={styles.inviteActions}>{incoming && invitation.status === "pending" && <><button className={styles.miniButton} type="button" onClick={() => respond("accept", invitation.id)}>接受</button><button className={`${styles.miniButton} ${styles.danger}`} type="button" onClick={() => respond("reject", invitation.id)}>拒绝</button></>}{outgoing && invitation.status === "pending" && <button className={`${styles.miniButton} ${styles.danger}`} type="button" onClick={() => respond("withdraw", invitation.id)}>撤回</button>}</div></div>; })}</div>}</section><div className={styles.footerActions}><button type="button" onClick={exportBackup}>导出 JSON</button><label className={styles.fileLabel}><button type="button" onClick={() => fileRef.current?.click()}>导入 JSON</button><input ref={fileRef} className={styles.visuallyHidden} type="file" accept="application/json,.json" onChange={(e) => void importBackup(e.target.files?.[0])} /></label><button className={styles.danger} type="button" onClick={() => { if (!window.confirm("清空本机所有身份、活动、资料和邀请？")) return; setSnapshot(EMPTY_TEAM_MATCH_SNAPSHOT); setMessage("本机队友匹配数据已清空。"); }}>清空本机数据</button></div>{error && <p className={styles.error} role="alert">{error}</p>}<p className={styles.message} role="status" aria-live="polite">{message}</p></div></> : <div className={styles.content}><div className={styles.noticeEmpty}>先在左侧创建一个活动。创建后，你可以在同一浏览器新建并切换 participant / viewer 身份，演示完整边界。</div></div>}</section>
    </section>
  </main>;
}
