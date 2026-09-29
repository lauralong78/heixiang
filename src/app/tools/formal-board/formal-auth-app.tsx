"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "../progress-board/progress-board.module.css";

type AuthMode = "login" | "register";
type PublicUser = { id: string; loginId: string; status: string; createdAt: string };
type Activity = { id: string; title: string; description: string; status: string; role: string; updated_at: string; deadline_at?: string | null };
type Team = { id: string; name: string; description: string; task_count: number; sort_order: number; data_version?: number };
type Task = { id: string; team_id: string; title: string; description: string; status: "todo" | "doing" | "done"; progress: number; data_version: number };
type ActivityStats = { total: number; doing: number; done: number; progress: number };

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats>({ total: 0, doing: 0, done: 0, progress: 0 });
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityDeadlineInput, setActivityDeadlineInput] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("正在检查登录状态…");
  const [busy, setBusy] = useState(true);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/formal-board/auth/me", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as unknown }))
      .then(async ({ response, payload }) => {
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

  useEffect(() => {
    if (!user) {
      return;
    }
    fetch("/api/formal-board/activities", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as unknown }))
      .then(({ response, payload }) => {
        if (!response.ok) {
          setActivityMessage(extractMessage(payload, "活动暂时无法读取。"));
          return;
        }
        const data = (payload as { data?: { activities?: Activity[] } }).data;
        setActivities(data?.activities ?? []);
      })
      .catch(() => setActivityMessage("活动读取失败，请检查网络后重试。"));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    window.history.replaceState({}, "", window.location.pathname);
    void joinActivity(token);
  }, [user]);

  useEffect(() => {
    if (!selectedActivityId) {
      return;
    }
    fetch(`/api/formal-board/teams?activityId=${encodeURIComponent(selectedActivityId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as unknown }))
      .then(async ({ response, payload }) => {
        if (!response.ok) {
          setTeamMessage(extractMessage(payload, "队伍暂时无法读取。"));
          return;
        }
        const data = (payload as { data?: { teams?: Team[] } }).data;
        const nextTeams = data?.teams ?? [];
        setTeams(nextTeams);
        const taskLists = await Promise.all(nextTeams.map(async (team) => {
          const response = await fetch(`/api/formal-board/tasks?activityId=${encodeURIComponent(selectedActivityId)}&teamId=${encodeURIComponent(team.id)}`, { cache: "no-store" });
          if (!response.ok) return [] as Task[];
          const payload = await response.json() as { data?: { tasks?: Task[] } };
          return payload.data?.tasks ?? [];
        }));
        const allTasks = taskLists.flat();
        setActivityStats({
          total: allTasks.length,
          doing: allTasks.filter((task) => task.status === "doing").length,
          done: allTasks.filter((task) => task.status === "done").length,
          progress: allTasks.length ? Math.round(allTasks.reduce((sum, task) => sum + task.progress, 0) / allTasks.length) : 0,
        });
        setTeamMessage("");
      })
      .catch(() => setTeamMessage("队伍读取失败，请检查网络后重试。"));
  }, [selectedActivityId]);

  useEffect(() => {
    if (!selectedActivityId || !selectedTeamId) return;
    fetch(`/api/formal-board/tasks?activityId=${encodeURIComponent(selectedActivityId)}&teamId=${encodeURIComponent(selectedTeamId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as unknown }))
      .then(({ response, payload }) => {
        if (!response.ok) { setTaskMessage(extractMessage(payload, "任务暂时无法读取。")); return; }
        const data = (payload as { data?: { tasks?: Task[] } }).data;
        setTasks(data?.tasks ?? []);
        setTaskMessage("");
      })
      .catch(() => setTaskMessage("任务读取失败，请检查网络后重试。"));
  }, [selectedActivityId, selectedTeamId]);

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
      if (mode === "register") {
        setUser(null);
        setMode("login");
        setMessage("账号已创建，请切换到登录并重新输入密码。");
      } else {
        setUser(data?.user ?? null);
        setMessage("登录成功。登录状态由安全 Cookie 保存。" );
      }
      setPassword("");
      setConfirmPassword("");
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
      setActivities([]);
      setSelectedActivityId(null);
      setTeams([]);
      setSelectedTeamId(null);
      setTasks([]);
      setActivityStats({ total: 0, doing: 0, done: 0, progress: 0 });
      setMode("login");
      setMessage("已退出登录。");
    } catch {
      setMessage("网络连接失败，退出状态未确认。请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivityMessage("正在创建活动…");
    try {
      const response = await fetch("/api/formal-board/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: activityTitle, description: activityDescription, deadlineAt: activityDeadlineInput ? new Date(activityDeadlineInput).toISOString() : null }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        setActivityMessage(extractMessage(payload, "活动创建失败，请稍后重试。"));
        return;
      }
      const data = (payload as { data?: { activity?: Activity } }).data;
      if (data?.activity) setActivities((current) => [data.activity as Activity, ...current]);
      setActivityTitle("");
      setActivityDescription("");
      setActivityDeadlineInput("");
      setActivityMessage("活动已创建，主持人权限已由服务器确认。");
    } catch {
      setActivityMessage("网络连接失败，活动没有被标记为已创建。");
    }
  }

  async function joinActivity(value: string) {
    setInviteMessage("正在验证邀请…");
    try {
      const response = await fetch("/api/formal-board/invites/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: value }) });
      const payload = await response.json() as unknown;
      if (!response.ok) { setInviteMessage(extractMessage(payload, "邀请无效或已过期。")); return; }
      const data = (payload as { data?: { activity_id?: string; already_joined?: boolean } }).data;
      const activityResponse = await fetch("/api/formal-board/activities", { cache: "no-store" });
      const activityPayload = await activityResponse.json() as { data?: { activities?: Activity[] } };
      const nextActivities = activityPayload.data?.activities ?? [];
      setActivities(nextActivities);
      if (data?.activity_id) { setSelectedActivityId(data.activity_id); setSelectedTeamId(null); setTasks([]); }
      setInviteTokenInput("");
      setInviteMessage(data?.already_joined ? "你已经是这个活动的成员，已恢复访问。" : "已加入活动，正在同步队伍和任务。")
    } catch { setInviteMessage("网络连接失败，加入状态未确认。请稍后重试。"); }
  }

  async function createInvite() {
    if (!selectedActivityId) return;
    setInviteMessage("正在生成邀请链接…");
    try {
      const response = await fetch("/api/formal-board/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: selectedActivityId, role: "collaborator", maxUses: 50 }) });
      const payload = await response.json() as unknown;
      if (!response.ok) { setInviteMessage(extractMessage(payload, "邀请生成失败，请稍后重试。")); return; }
      const data = (payload as { data?: { token?: string } }).data;
      if (!data?.token) { setInviteMessage("服务器没有返回可用邀请，请稍后重试。"); return; }
      setInviteLink(`${window.location.origin}/tools/formal-board?invite=${encodeURIComponent(data.token)}`);
      setInviteMessage("邀请链接已生成。请用私下渠道发送，不要公开发布。");
    } catch { setInviteMessage("网络连接失败，邀请状态未确认。请稍后重试。"); }
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); setInviteMessage("邀请链接已复制到剪贴板。"); }
    catch { setInviteMessage("浏览器拒绝访问剪贴板，请手动复制链接。" ); }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId) return;
    setTeamMessage("正在创建队伍…");
    try {
      const response = await fetch("/api/formal-board/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: selectedActivityId, name: teamName, description: teamDescription }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        setTeamMessage(extractMessage(payload, "队伍创建失败，请稍后重试。"));
        return;
      }
      const data = (payload as { data?: { team?: Team } }).data;
      if (data?.team) setTeams((current) => [...current, { ...(data.team as Team), data_version: 1 }]);
      setTeamName("");
      setTeamDescription("");
      setTeamMessage("队伍已创建，写入权限由服务器确认。");
    } catch {
      setTeamMessage("网络连接失败，队伍没有被标记为已创建。");
    }
  }

  async function editTeam(team: Team) {
    if (!selectedActivityId) return;
    const name = window.prompt("队伍名称", team.name)?.trim();
    if (!name || name === team.name) return;
    const response = await fetch("/api/formal-board/teams", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: selectedActivityId, teamId: team.id, name, description: team.description, expectedVersion: team.data_version }) });
    const payload = await response.json() as unknown;
    if (!response.ok) { setTeamMessage(extractMessage(payload, "队伍修改失败，请刷新后重试。")); return; }
    const data = (payload as { data?: { team?: Team } }).data;
    if (data?.team) setTeams((current) => current.map((item) => item.id === team.id ? data.team as Team : item));
    setTeamMessage("队伍已修改。");
  }

  async function removeTeam(team: Team) {
    if (!selectedActivityId || team.data_version === undefined || !window.confirm(`确认删除队伍“${team.name}”？任务会保留历史但不再显示。`)) return;
    const response = await fetch(`/api/formal-board/teams?activityId=${encodeURIComponent(selectedActivityId)}&teamId=${encodeURIComponent(team.id)}&expectedVersion=${team.data_version}`, { method: "DELETE" });
    const payload = await response.json() as unknown;
    if (!response.ok) { setTeamMessage(extractMessage(payload, "队伍删除失败，请刷新后重试。")); return; }
    setTeams((current) => current.filter((item) => item.id !== team.id));
    if (selectedTeamId === team.id) { setSelectedTeamId(null); setTasks([]); }
    setTeamMessage("队伍已删除。");
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivityId || !selectedTeamId) return;
    setTaskMessage("正在创建任务…");
    try {
      const response = await fetch("/api/formal-board/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: selectedActivityId, teamId: selectedTeamId, title: taskTitle, description: taskDescription }) });
      const payload = await response.json() as unknown;
      if (!response.ok) { setTaskMessage(extractMessage(payload, "任务创建失败，请稍后重试。")); return; }
      const data = (payload as { data?: { task?: Task } }).data;
      if (data?.task) {
        setTasks((current) => [...current, data.task as Task]);
        setTeams((current) => current.map((team) => team.id === selectedTeamId ? { ...team, task_count: team.task_count + 1 } : team));
      }
      setTaskTitle(""); setTaskDescription(""); setTaskMessage("任务已创建，状态可以继续更新。");
    } catch { setTaskMessage("网络连接失败，任务没有被标记为已创建。"); }
  }

  async function changeTaskStatus(task: Task, status: Task["status"], progress = status === "done" ? 100 : status === "todo" ? 0 : task.progress) {
    if (!selectedActivityId) return;
    setTaskMessage("正在更新任务…");
    try {
      const response = await fetch("/api/formal-board/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityId: selectedActivityId, taskId: task.id, status, progress, expectedVersion: task.data_version }) });
      const payload = await response.json() as unknown;
      if (!response.ok) { setTaskMessage(extractMessage(payload, "任务更新失败，请刷新后重试。")); return; }
      const data = (payload as { data?: { task?: Task } }).data;
      if (data?.task) setTasks((current) => current.map((item) => item.id === task.id ? data.task as Task : item));
      setTaskMessage("任务状态已更新。");
    } catch { setTaskMessage("网络连接失败，任务状态未确认。"); }
  }

  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId);
  const totalTaskCount = activityStats.total || teams.reduce((sum, team) => sum + team.task_count, 0);
  const completedTaskCount = tasks.filter((task) => task.status === "done").length;
  const activeTaskCount = tasks.filter((task) => task.status === "doing").length;
  const selectedTeamProgress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) : 0;
  const activityDeadline = selectedActivity?.deadline_at ? new Date(selectedActivity.deadline_at) : null;
  const activityDeadlineLabel = activityDeadline && !Number.isNaN(activityDeadline.getTime()) ? activityDeadline.toLocaleString("zh-CN", { hour12: false }) : "未设置截止时间";
  const remainingSeconds = activityDeadline && !Number.isNaN(activityDeadline.getTime()) ? Math.max(0, Math.floor((activityDeadline.getTime() - clock) / 1000)) : null;
  const remainingLabel = remainingSeconds === null ? "未设置倒计时" : remainingSeconds === 0 ? "已截止" : `${Math.floor(remainingSeconds / 86400)}天 ${String(Math.floor((remainingSeconds % 86400) / 3600)).padStart(2, "0")}时 ${String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, "0")}分`;

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

        <div className={user ? styles.dashboardShell : styles.setupForm}>
          {user ? (
            <div className={styles.authStatus}>
              <div className={styles.dashboardHead}>
                <div>
                  <span className={styles.formIndex}>LIVE EVENT / 现场进度</span>
                  <h2>{selectedActivity?.title || "选择一个活动"}</h2>
                  <p>{selectedActivity ? (selectedActivity.description || "正式版活动正在服务器上同步。") : `欢迎回来，${user.loginId}。先创建或选择一个活动。`}</p>
                  {selectedActivity && <small className={styles.deadlineText}>截止：{activityDeadlineLabel}</small>}
                  {selectedActivity && <strong className={styles.countdownText}>剩余：{remainingLabel}</strong>}
                </div>
                <div className={styles.dashboardStatus}>
                  <span>SERVER SESSION</span>
                  <strong>{selectedActivity?.status || "READY"}</strong>
                  <small>{selectedActivity ? "跨设备数据已连接" : "等待选择活动"}</small>
                </div>
              </div>
              <div className={styles.dashboardActions}>
                <button type="button" onClick={() => document.getElementById("formal-activity-form")?.scrollIntoView({ behavior: "smooth", block: "center" })}>创建活动</button>
                <button type="button" onClick={() => window.location.reload()}>刷新数据</button>
                <button type="button" className={styles.dashboardDanger} onClick={logout} disabled={busy}>退出登录</button>
              </div>
              <section className={styles.invitePanel} aria-label="邀请加入活动">
                <div>
                  <span className={styles.formIndex}>JOIN / INVITE</span>
                  <strong>邀请成员加入当前活动</strong>
                  <p>邀请默认授予协作者权限；服务端会再次检查活动、角色和邀请状态。</p>
                </div>
                <div className={styles.inviteActions}>
                  <input value={inviteTokenInput} onChange={(event) => setInviteTokenInput(event.target.value)} placeholder="粘贴邀请链接或邀请码" aria-label="邀请链接或邀请码" />
                  <button type="button" onClick={() => void joinActivity(inviteTokenInput)} disabled={!inviteTokenInput.trim()}>加入活动</button>
                  {selectedActivity?.role === "host" && <button type="button" onClick={() => void createInvite()} disabled={!selectedActivityId}>生成邀请链接</button>}
                </div>
                {inviteLink && <div className={styles.inviteLinkRow}><input readOnly value={inviteLink} aria-label="生成的邀请链接" /><button type="button" onClick={() => void copyInviteLink()}>复制链接</button></div>}
                <p className={styles.message} role="status" aria-live="polite">{inviteMessage}</p>
              </section>
              <div className={styles.metrics} aria-label="活动统计">
                <div className={styles.metricLead}>
                  <span>{selectedTeamId ? "SELECTED TEAM PROGRESS" : "ACTIVITY PROGRESS"}</span>
                  <strong>{selectedTeamId ? selectedTeamProgress : activityStats.progress}<small>%</small></strong>
                  <div className={styles.progressTrack}><i style={{ transform: `scaleX(${(selectedTeamId ? selectedTeamProgress : activityStats.progress) / 100})` }} /></div>
                </div>
                <div className={styles.metric}><strong>{teams.length}</strong><span>队伍</span></div>
                <div className={styles.metric}><strong>{totalTaskCount}</strong><span>总任务</span></div>
                <div className={styles.metric}><strong>{selectedTeamId ? activeTaskCount : activityStats.doing}</strong><span>{selectedTeamId ? "当前队伍进行中" : "活动进行中"}</span></div>
                <div className={styles.metric}><strong>{selectedTeamId ? completedTaskCount : activityStats.done}</strong><span>{selectedTeamId ? "当前队伍已完成" : "活动已完成"}</span></div>
              </div>
              <section className={styles.activityBoard} aria-labelledby="formal-activities-heading">
                <div className={styles.sectionHeading}>
                  <div><span>01 / ACTIVITIES</span><h2 id="formal-activities-heading">活动</h2></div>
                  <p>活动是最高层级，下面再展开队伍和任务。</p>
                </div>
                <form id="formal-activity-form" className={styles.activityForm} onSubmit={createActivity}>
                  <label>
                    活动名称
                    <input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="例如：周末黑客松" required />
                  </label>
                  <label>
                    活动说明（可选）
                    <textarea value={activityDescription} onChange={(event) => setActivityDescription(event.target.value)} placeholder="给队友看的简短说明" rows={3} />
                  </label>
                  <label>
                    截止时间（可选）
                    <input type="datetime-local" value={activityDeadlineInput} onChange={(event) => setActivityDeadlineInput(event.target.value)} />
                  </label>
                  <button className={styles.primaryButton} type="submit" disabled={busy}><span>创建活动</span><b>↗</b></button>
                </form>
                <p className={styles.message} role="status" aria-live="polite">{activityMessage}</p>
                <div className={styles.activityList}>
                  <span className={styles.formIndex}>活动列表</span>
                  {activities.length === 0 ? <p>还没有活动。创建后会显示在这里。</p> : activities.map((activity) => (
                    <button type="button" key={activity.id} className={`${styles.activityItem} ${selectedActivityId === activity.id ? styles.activityItemActive : ""}`} onClick={() => { setSelectedActivityId(activity.id); setSelectedTeamId(null); setTasks([]); }}>
                      <div><strong>{activity.title}</strong><span>{activity.role} · {activity.status}</span></div>
                      <small>{activity.description || "暂无说明"}{activity.deadline_at ? ` · 截止 ${new Date(activity.deadline_at).toLocaleString("zh-CN", { hour12: false })}` : ""}</small>
                    </button>
                  ))}
                </div>
              </section>
              {selectedActivityId && (
                <div className={styles.teamPanel}>
                  <span className={styles.formIndex}>03 / TEAMS</span>
                  <form className={styles.activityForm} onSubmit={createTeam}>
                    <label>队伍名称<input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="例如：蓝队" required /></label>
                    <label>队伍说明（可选）<input value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} placeholder="队伍负责什么" /></label>
                    <button className={styles.primaryButton} type="submit"><span>创建队伍</span><b>↗</b></button>
                  </form>
                  <p className={styles.message} role="status" aria-live="polite">{teamMessage}</p>
                  {teams.length === 0 ? <p className={styles.authHint}>这个活动还没有队伍。</p> : teams.map((team) => <div className={`${styles.teamItem} ${selectedTeamId === team.id ? styles.teamItemActive : ""}`} key={team.id} onClick={() => setSelectedTeamId(team.id)} role="button" tabIndex={0}><strong>{team.name}</strong><span>{team.task_count} 个任务</span><div className={styles.itemActions}><button type="button" onClick={(event) => { event.stopPropagation(); void editTeam(team); }}>编辑</button><button type="button" onClick={(event) => { event.stopPropagation(); void removeTeam(team); }}>删除</button></div></div>)}
                </div>
              )}
              {selectedActivityId && selectedTeamId && (
                <div className={styles.taskPanel}>
                  <span className={styles.formIndex}>04 / TASKS</span>
                  <form className={styles.activityForm} onSubmit={createTask}>
                    <label>任务标题<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="例如：完成首页原型" required /></label>
                    <label>任务说明（可选）<input value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="任务完成标准" /></label>
                    <button className={styles.primaryButton} type="submit"><span>创建任务</span><b>↗</b></button>
                  </form>
                  <p className={styles.message} role="status" aria-live="polite">{taskMessage}</p>
                  {tasks.length === 0 ? <p className={styles.authHint}>这个队伍还没有任务。</p> : tasks.map((task) => <div className={styles.taskItem} key={task.id}><div><strong>{task.title}</strong><input className={styles.taskProgressInput} type="number" min="0" max="100" value={task.progress} onChange={(event) => changeTaskStatus(task, task.status, Number(event.target.value))} aria-label={`更新任务 ${task.title} 进度`} /><span>%</span></div><select value={task.status} onChange={(event) => changeTaskStatus(task, event.target.value as Task["status"])} aria-label={`更新任务 ${task.title} 状态`}><option value="todo">待办</option><option value="doing">进行中</option><option value="done">完成</option></select></div>)}
                </div>
              )}
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
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 6 位" required />
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
