"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BOARD_LIMITS,
  BOARD_STORAGE_KEY,
  BoardValidationError,
  assertImportSize,
  calculateCountdown,
  createBoard,
  createId,
  makeBackup,
  normalizeDuplicateKey,
  parseBackupText,
  summarizeBoard,
  summarizeTasks,
  validateBoard,
  type BoardTask,
  type ProgressBoard,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/progress-board/board";

import styles from "./progress-board.module.css";

const PRIORITY_LABELS: Record<TaskPriority, string> = { high: "高", medium: "中", low: "低" };
const STATUS_LABELS: Record<TaskStatus, string> = { todo: "待办", doing: "进行中", done: "完成" };
const EMPTY_TASK_DRAFT = { title: "", priority: "medium" as TaskPriority };

function subscribeHydration() {
  return () => undefined;
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function readStoredBoard(): { board: ProgressBoard | null; warning: string } {
  if (typeof window === "undefined") return { board: null, warning: "" };
  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!raw) return { board: null, warning: "" };
    return { board: validateBoard(JSON.parse(raw)), warning: "" };
  } catch {
    try { window.localStorage.removeItem(BOARD_STORAGE_KEY); } catch { /* storage is unavailable */ }
    return {
      board: null,
      warning: "旧的本地数据无效或无法读取，已使用空白看板。你仍可导入有效备份。",
    };
  }
}

export function ProgressBoardApp() {
  const hydrated = useSyncExternalStore(subscribeHydration, getClientSnapshot, getServerSnapshot);
  const [stored] = useState(readStoredBoard);
  const [board, setBoard] = useState<ProgressBoard | null>(stored.board);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState(stored.warning);
  const [setupName, setSetupName] = useState("");
  const [setupDeadline, setSetupDeadline] = useState("");
  const [teamName, setTeamName] = useState("");
  const [taskDrafts, setTaskDrafts] = useState<Record<string, typeof EMPTY_TASK_DRAFT>>({});
  const [editingEvent, setEditingEvent] = useState(false);
  const [eventDraft, setEventDraft] = useState({ name: "", deadline: "" });
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamEditName, setTeamEditName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEdit, setTaskEdit] = useState({ title: "", priority: "medium" as TaskPriority });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const kickoff = window.setTimeout(updateClock, 0);
    const timer = window.setInterval(updateClock, 1_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (board) window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(board));
      else window.localStorage.removeItem(BOARD_STORAGE_KEY);
    } catch {
      window.setTimeout(() => {
        setMessage("浏览器未能保存数据：可能是隐私模式或本地存储空间不足。请立即导出备份。");
      }, 0);
    }
  }, [board, hydrated]);

  if (!hydrated) {
    return <main className={styles.loading} aria-busy="true">正在读取本地看板…</main>;
  }

  function commit(update: (current: ProgressBoard) => ProgressBoard, successMessage = "") {
    setBoard((current) => {
      if (!current) return current;
      return { ...update(current), updatedAt: new Date().toISOString() };
    });
    setMessage(successMessage);
  }

  function createEvent(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = createBoard(setupName, setupDeadline);
      if (Date.parse(created.deadline) <= Date.now()) {
        throw new BoardValidationError("新活动的截止时间必须晚于当前时间。");
      }
      setBoard(created);
      setMessage("活动已创建，数据会自动保存在此浏览器中。");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function addTeam(event: React.FormEvent) {
    event.preventDefault();
    if (!board) return;
    const name = teamName.trim().replace(/\s+/g, " ");
    if (!name) return setMessage("队伍名称不能为空。");
    if (name.length > BOARD_LIMITS.teamName) return setMessage(`队伍名称不能超过 ${BOARD_LIMITS.teamName} 个字符。`);
    if (board.teams.length >= BOARD_LIMITS.teams) return setMessage(`最多添加 ${BOARD_LIMITS.teams} 支队伍。`);
    if (board.teams.some((team) => normalizeDuplicateKey(team.name) === normalizeDuplicateKey(name))) {
      return setMessage(`队伍名称“${name}”已存在。`);
    }
    commit((current) => ({ ...current, teams: [...current.teams, { id: createId("team"), name, tasks: [] }] }), `已添加队伍“${name}”。`);
    setTeamName("");
  }

  function addTask(teamId: string, event: React.FormEvent) {
    event.preventDefault();
    if (!board) return;
    const draft = taskDrafts[teamId] ?? EMPTY_TASK_DRAFT;
    const title = draft.title.trim().replace(/\s+/g, " ");
    const team = board.teams.find((item) => item.id === teamId);
    if (!team) return;
    if (!title) return setMessage("任务标题不能为空。");
    if (title.length > BOARD_LIMITS.taskTitle) return setMessage(`任务标题不能超过 ${BOARD_LIMITS.taskTitle} 个字符。`);
    if (team.tasks.length >= BOARD_LIMITS.tasksPerTeam) return setMessage(`每支队伍最多添加 ${BOARD_LIMITS.tasksPerTeam} 个任务。`);
    const total = board.teams.reduce((sum, item) => sum + item.tasks.length, 0);
    if (total >= BOARD_LIMITS.totalTasks) return setMessage(`看板最多包含 ${BOARD_LIMITS.totalTasks} 个任务。`);
    if (team.tasks.some((task) => normalizeDuplicateKey(task.title) === normalizeDuplicateKey(title))) {
      return setMessage(`“${team.name}”中已存在任务“${title}”。`);
    }
    commit((current) => ({
      ...current,
      teams: current.teams.map((item) => item.id === teamId
        ? { ...item, tasks: [...item.tasks, { id: createId("task"), title, priority: draft.priority, status: "todo" }] }
        : item),
    }), `已为“${team.name}”添加任务。`);
    setTaskDrafts((current) => ({ ...current, [teamId]: { ...EMPTY_TASK_DRAFT } }));
  }

  function updateTaskStatus(teamId: string, taskId: string, status: TaskStatus) {
    commit((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId
        ? { ...team, tasks: team.tasks.map((task) => task.id === taskId ? { ...task, status } : task) }
        : team),
    }), "任务状态已更新，进度已重新计算。");
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      assertImportSize(file.size);
      const restored = parseBackupText(await file.text());
      if (board && !window.confirm("导入会覆盖当前本地看板。确认继续吗？")) return;
      setBoard(restored);
      setMessage(`已从“${file.name}”恢复 ${restored.teams.length} 支队伍。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      resetFileInput();
    }
  }

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function exportBackup() {
    if (!board) return;
    const blob = new Blob([JSON.stringify(makeBackup(board), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(board.eventName)}-progress-board.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage("JSON 备份已下载。");
  }

  function clearBoard() {
    if (!window.confirm("将删除此设备上的活动、队伍和任务。此操作无法撤销，确定清空吗？")) return;
    setBoard(null);
    setSetupName("");
    setSetupDeadline("");
    setMessage("本地看板已清空。");
  }

  const importControl = (
    <label className={styles.secondaryButton}>
      导入 JSON
      <input
        ref={fileInputRef}
        className={styles.visuallyHidden}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importBackup(event.target.files?.[0])}
      />
    </label>
  );

  if (!board) {
    return (
      <main className={styles.page}>
        <div className={styles.scanline} aria-hidden="true" />
        <header className={styles.topbar}>
          <span>LOCAL MODE · 无需登录</span>
        </header>
        <section className={styles.setupShell}>
          <div className={styles.setupIntro}>
            <p className={styles.kicker}>MISSION CONTROL / 现场指挥台</p>
            <h1>时间、任务和进度，放在一块看。</h1>
            <p>先建活动，再添加队伍和任务。倒计时与完成比例会自动更新，数据只保存在这个浏览器里。</p>
          </div>
          <form className={styles.setupForm} onSubmit={createEvent}>
            <div className={styles.formIndex}>01 / INITIALIZE</div>
            <label>
              活动名称
              <input value={setupName} onChange={(event) => setSetupName(event.target.value)} maxLength={BOARD_LIMITS.eventName} placeholder="例如：秋季校园 Hack Day" required />
            </label>
            <label>
              截止日期与时间
              <input value={setupDeadline} onChange={(event) => setSetupDeadline(event.target.value)} type="datetime-local" required />
            </label>
            <button className={styles.primaryButton} type="submit">创建本地看板 <span>→</span></button>
            <div className={styles.importRow}>{importControl}<small>仅接受本工具导出的 JSON，最大 512 KB</small></div>
            <p className={styles.message} role="status" aria-live="polite">{message}</p>
          </form>
        </section>
      </main>
    );
  }

  const progress = summarizeBoard(board);
  const countdown = calculateCountdown(board.deadline, now || Date.parse(board.updatedAt));

  return (
    <main className={styles.page}>
      <div className={styles.scanline} aria-hidden="true" />
      <header className={styles.topbar}>
        <span>LOCAL MODE · 自动保存</span>
      </header>

      <section className={styles.dashboardHead}>
        <div className={styles.eventBlock}>
          <p className={styles.kicker}>LIVE EVENT / 现场进度</p>
          <h1>{board.eventName}</h1>
          <p className={styles.deadlineText}>截止于 {formatDate(board.deadline)}</p>
        </div>
        <div className={`${styles.countdown} ${countdown.ended ? styles.ended : ""}`} aria-live="polite">
          <span className={styles.countdownLabel}>{countdown.ended ? "EVENT CLOSED" : "TIME REMAINING"}</span>
          {countdown.ended ? <strong>已结束</strong> : (
            <div className={styles.clock}>
              <ClockUnit value={countdown.days} label="天" />
              <ClockUnit value={countdown.hours} label="时" />
              <ClockUnit value={countdown.minutes} label="分" />
              <ClockUnit value={countdown.seconds} label="秒" />
            </div>
          )}
        </div>
      </section>

      <section className={styles.commandBar} aria-label="看板操作">
        <button type="button" onClick={() => {
          setEventDraft({ name: board.eventName, deadline: toLocalDateTime(board.deadline) });
          setEditingEvent(true);
        }}>编辑活动</button>
        <button type="button" onClick={exportBackup}>导出 JSON</button>
        {importControl}
        <button className={styles.dangerButton} type="button" onClick={clearBoard}>清空本地数据</button>
        <p className={styles.message} role="status" aria-live="polite">{message}</p>
      </section>

      {editingEvent && (
        <form className={styles.inlineEditor} onSubmit={(event) => {
          event.preventDefault();
          try {
            const normalized = createBoard(eventDraft.name, eventDraft.deadline);
            commit((current) => ({ ...current, eventName: normalized.eventName, deadline: normalized.deadline }), "活动信息已更新。");
            setEditingEvent(false);
          } catch (error) { setMessage(errorMessage(error)); }
        }}>
          <label>活动名称<input value={eventDraft.name} maxLength={BOARD_LIMITS.eventName} onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>截止时间<input type="datetime-local" value={eventDraft.deadline} onChange={(event) => setEventDraft((current) => ({ ...current, deadline: event.target.value }))} /></label>
          <button type="submit">保存</button><button type="button" onClick={() => setEditingEvent(false)}>取消</button>
        </form>
      )}

      <section className={styles.metrics} aria-label="总体进度">
        <div className={styles.metricLead}>
          <span>OVERALL PROGRESS</span>
          <strong>{progress.percent}<small>%</small></strong>
          <div className={styles.progressTrack}><i style={{ transform: `scaleX(${progress.percent / 100})` }} /></div>
        </div>
        <Metric value={board.teams.length} label="队伍" />
        <Metric value={progress.total} label="总任务" />
        <Metric value={progress.doing} label="进行中" />
        <Metric value={progress.done} label="已完成" />
      </section>

      <section className={styles.teamSection}>
        <div className={styles.sectionHeading}>
          <div><span>02 / TEAMS</span><h2>队伍与任务</h2></div>
          <form onSubmit={addTeam}>
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={BOARD_LIMITS.teamName} placeholder="输入新队伍名称" aria-label="新队伍名称" />
            <button type="submit">+ 添加队伍</button>
          </form>
        </div>

        {board.teams.length === 0 ? (
          <div className={styles.emptyState}><b>还没有队伍</b><p>从上方添加第一支队伍，再为它拆分任务。</p></div>
        ) : (
          <div className={styles.teamGrid}>
            {board.teams.map((team, index) => {
              const teamProgress = summarizeTasks(team.tasks);
              const draft = taskDrafts[team.id] ?? EMPTY_TASK_DRAFT;
              return (
                <article className={styles.teamCard} key={team.id}>
                  <header className={styles.teamHeader}>
                    <div className={styles.teamNumber}>{String(index + 1).padStart(2, "0")}</div>
                    <div className={styles.teamIdentity}>
                      {editingTeamId === team.id ? (
                        <form onSubmit={(event) => {
                          event.preventDefault();
                          const name = teamEditName.trim().replace(/\s+/g, " ");
                          if (!name) return setMessage("队伍名称不能为空。");
                          if (name.length > BOARD_LIMITS.teamName) return setMessage(`队伍名称不能超过 ${BOARD_LIMITS.teamName} 个字符。`);
                          if (board.teams.some((item) => item.id !== team.id && normalizeDuplicateKey(item.name) === normalizeDuplicateKey(name))) return setMessage(`队伍名称“${name}”已存在。`);
                          commit((current) => ({ ...current, teams: current.teams.map((item) => item.id === team.id ? { ...item, name } : item) }), "队伍名称已更新。");
                          setEditingTeamId(null);
                        }}>
                          <input value={teamEditName} maxLength={BOARD_LIMITS.teamName} onChange={(event) => setTeamEditName(event.target.value)} aria-label="编辑队伍名称" autoFocus />
                          <button type="submit">保存</button><button type="button" onClick={() => setEditingTeamId(null)}>取消</button>
                        </form>
                      ) : <h3>{team.name}</h3>}
                      <span>{teamProgress.done} / {teamProgress.total} 完成</span>
                    </div>
                    <div className={styles.teamActions}>
                      <button type="button" onClick={() => { setEditingTeamId(team.id); setTeamEditName(team.name); }}>编辑</button>
                      <button type="button" onClick={() => {
                        if (!window.confirm(`删除“${team.name}”及其全部任务？`)) return;
                        commit((current) => ({ ...current, teams: current.teams.filter((item) => item.id !== team.id) }), `已删除队伍“${team.name}”。`);
                      }}>删除</button>
                    </div>
                  </header>
                  <div className={styles.teamProgress}><i style={{ transform: `scaleX(${teamProgress.percent / 100})` }} /><span>{teamProgress.percent}%</span></div>

                  <div className={styles.taskList}>
                    {team.tasks.length === 0 && <p className={styles.noTasks}>暂无任务，添加一项具体交付物。</p>}
                    {team.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        editing={editingTaskId === task.id}
                        edit={taskEdit}
                        setEdit={setTaskEdit}
                        onStartEdit={() => { setEditingTaskId(task.id); setTaskEdit({ title: task.title, priority: task.priority }); }}
                        onCancel={() => setEditingTaskId(null)}
                        onSave={() => {
                          const title = taskEdit.title.trim().replace(/\s+/g, " ");
                          if (!title) return setMessage("任务标题不能为空。");
                          if (title.length > BOARD_LIMITS.taskTitle) return setMessage(`任务标题不能超过 ${BOARD_LIMITS.taskTitle} 个字符。`);
                          if (team.tasks.some((item) => item.id !== task.id && normalizeDuplicateKey(item.title) === normalizeDuplicateKey(title))) return setMessage(`“${team.name}”中已存在任务“${title}”。`);
                          commit((current) => ({ ...current, teams: current.teams.map((item) => item.id === team.id ? { ...item, tasks: item.tasks.map((entry) => entry.id === task.id ? { ...entry, title, priority: taskEdit.priority } : entry) } : item) }), "任务已更新。");
                          setEditingTaskId(null);
                        }}
                        onStatus={(status) => updateTaskStatus(team.id, task.id, status)}
                        onDelete={() => {
                          commit((current) => ({ ...current, teams: current.teams.map((item) => item.id === team.id ? { ...item, tasks: item.tasks.filter((entry) => entry.id !== task.id) } : item) }), `已删除任务“${task.title}”。`);
                        }}
                      />
                    ))}
                  </div>

                  <form className={styles.addTask} onSubmit={(event) => addTask(team.id, event)}>
                    <input value={draft.title} maxLength={BOARD_LIMITS.taskTitle} onChange={(event) => setTaskDrafts((current) => ({ ...current, [team.id]: { ...draft, title: event.target.value } }))} placeholder="添加任务标题" aria-label={`为 ${team.name} 添加任务`} />
                    <select value={draft.priority} onChange={(event) => setTaskDrafts((current) => ({ ...current, [team.id]: { ...draft, priority: event.target.value as TaskPriority } }))} aria-label="任务优先级">
                      <option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option>
                    </select>
                    <button type="submit">添加</button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function TaskRow({ task, editing, edit, setEdit, onStartEdit, onCancel, onSave, onStatus, onDelete }: {
  task: BoardTask;
  editing: boolean;
  edit: { title: string; priority: TaskPriority };
  setEdit: React.Dispatch<React.SetStateAction<{ title: string; priority: TaskPriority }>>;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onStatus: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  if (editing) return (
    <div className={styles.taskEditRow}>
      <input value={edit.title} maxLength={BOARD_LIMITS.taskTitle} onChange={(event) => setEdit((current) => ({ ...current, title: event.target.value }))} aria-label="编辑任务标题" autoFocus />
      <select value={edit.priority} onChange={(event) => setEdit((current) => ({ ...current, priority: event.target.value as TaskPriority }))} aria-label="编辑任务优先级">
        <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
      </select>
      <button type="button" onClick={onSave}>保存</button><button type="button" onClick={onCancel}>取消</button>
    </div>
  );

  return (
    <div className={`${styles.taskRow} ${styles[`status_${task.status}`]}`}>
      <span className={`${styles.priority} ${styles[`priority_${task.priority}`]}`}>{PRIORITY_LABELS[task.priority]}</span>
      <b>{task.title}</b>
      <select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)} aria-label={`${task.title}的状态`}>
        {Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <div className={styles.taskActions}><button type="button" onClick={onStartEdit}>编辑</button><button type="button" onClick={onDelete}>删除</button></div>
    </div>
  );
}

function ClockUnit({ value, label }: { value: number; label: string }) {
  return <span><b>{String(value).padStart(2, "0")}</b><small>{label}</small></span>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className={styles.metric}><strong>{value}</strong><span>{label}</span></div>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 60) || "黑箱";
}
