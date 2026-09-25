export const BOARD_STORAGE_KEY = "hackkit.progress-board.v1";
export const BOARD_FORMAT = "hackkit-progress-board";
export const BOARD_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 512 * 1024;

export const BOARD_LIMITS = {
  eventName: 80,
  teamName: 48,
  taskTitle: 120,
  teams: 100,
  tasksPerTeam: 200,
  totalTasks: 1_000,
} as const;

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";

export interface BoardTask {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
}

export interface BoardTeam {
  id: string;
  name: string;
  tasks: BoardTask[];
}

export interface ProgressBoard {
  id: string;
  eventName: string;
  deadline: string;
  teams: BoardTeam[];
  createdAt: string;
  updatedAt: string;
}

export interface BoardBackup {
  format: typeof BOARD_FORMAT;
  version: typeof BOARD_VERSION;
  exportedAt: string;
  board: ProgressBoard;
}

export interface BoardProgress {
  total: number;
  done: number;
  doing: number;
  todo: number;
  percent: number;
}

export interface Countdown {
  ended: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMilliseconds: number;
}

export class BoardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardValidationError";
  }
}

export function createId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createBoard(eventName: string, deadline: string): ProgressBoard {
  const now = new Date().toISOString();
  return {
    id: createId("board"),
    eventName: normalizeRequiredName(eventName, "活动名称", BOARD_LIMITS.eventName),
    deadline: normalizeDate(deadline, "截止时间"),
    teams: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeTasks(tasks: readonly BoardTask[]): BoardProgress {
  const done = tasks.filter((task) => task.status === "done").length;
  const doing = tasks.filter((task) => task.status === "doing").length;
  const todo = tasks.length - done - doing;
  return {
    total: tasks.length,
    done,
    doing,
    todo,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export function summarizeBoard(board: ProgressBoard): BoardProgress {
  return summarizeTasks(board.teams.flatMap((team) => team.tasks));
}

export function calculateCountdown(deadline: string, now = Date.now()): Countdown {
  const deadlineTime = Date.parse(deadline);
  const remaining = Number.isFinite(deadlineTime) ? Math.max(0, deadlineTime - now) : 0;
  const totalSeconds = Math.floor(remaining / 1_000);
  return {
    ended: remaining === 0,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    totalMilliseconds: remaining,
  };
}

export function makeBackup(board: ProgressBoard, exportedAt = new Date().toISOString()): BoardBackup {
  return {
    format: BOARD_FORMAT,
    version: BOARD_VERSION,
    exportedAt,
    board,
  };
}

export function parseBackupText(text: string): ProgressBoard {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoardValidationError("文件不是有效的 JSON。请检查文件是否完整。");
  }
  return validateBackup(value);
}

export function assertImportSize(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MAX_IMPORT_BYTES) {
    throw new BoardValidationError(`备份文件不能超过 ${Math.round(MAX_IMPORT_BYTES / 1024)} KB。`);
  }
}

export function validateBackup(value: unknown): ProgressBoard {
  const backup = requireRecord(value, "备份文件");
  if (backup.format !== BOARD_FORMAT) {
    throw new BoardValidationError("这不是 HackKit 进度看板备份文件。");
  }
  if (backup.version !== BOARD_VERSION) {
    throw new BoardValidationError(`备份版本不兼容：仅支持版本 ${BOARD_VERSION}。`);
  }
  requireIsoDate(backup.exportedAt, "导出时间");
  return validateBoard(backup.board);
}

export function validateBoard(value: unknown): ProgressBoard {
  const board = requireRecord(value, "看板数据");
  const teamsValue = requireArray(board.teams, "队伍列表");
  if (teamsValue.length > BOARD_LIMITS.teams) {
    throw new BoardValidationError(`队伍数量不能超过 ${BOARD_LIMITS.teams} 支。`);
  }

  const seenTeamIds = new Set<string>();
  const seenTeamNames = new Set<string>();
  let totalTasks = 0;
  const teams = teamsValue.map((team, teamIndex) => {
    const parsed = requireRecord(team, `第 ${teamIndex + 1} 支队伍`);
    const id = requireString(parsed.id, "队伍 ID", 120);
    const name = normalizeRequiredName(parsed.name, "队伍名称", BOARD_LIMITS.teamName);
    const nameKey = normalizeDuplicateKey(name);
    if (seenTeamIds.has(id)) throw new BoardValidationError("备份中存在重复的队伍 ID。");
    if (seenTeamNames.has(nameKey)) throw new BoardValidationError(`队伍名称“${name}”重复。`);
    seenTeamIds.add(id);
    seenTeamNames.add(nameKey);

    const tasksValue = requireArray(parsed.tasks, `${name} 的任务列表`);
    if (tasksValue.length > BOARD_LIMITS.tasksPerTeam) {
      throw new BoardValidationError(`每支队伍最多包含 ${BOARD_LIMITS.tasksPerTeam} 个任务。`);
    }
    totalTasks += tasksValue.length;
    if (totalTasks > BOARD_LIMITS.totalTasks) {
      throw new BoardValidationError(`所有队伍合计最多包含 ${BOARD_LIMITS.totalTasks} 个任务。`);
    }

    const seenTaskIds = new Set<string>();
    const seenTaskNames = new Set<string>();
    const tasks = tasksValue.map((task, taskIndex) => {
      const item = requireRecord(task, `${name} 的第 ${taskIndex + 1} 个任务`);
      const taskId = requireString(item.id, "任务 ID", 120);
      const title = normalizeRequiredName(item.title, "任务标题", BOARD_LIMITS.taskTitle);
      const titleKey = normalizeDuplicateKey(title);
      if (seenTaskIds.has(taskId)) throw new BoardValidationError(`${name} 中存在重复的任务 ID。`);
      if (seenTaskNames.has(titleKey)) throw new BoardValidationError(`${name} 中的任务“${title}”重复。`);
      seenTaskIds.add(taskId);
      seenTaskNames.add(titleKey);
      return {
        id: taskId,
        title,
        priority: requireEnum(item.priority, ["high", "medium", "low"], "任务优先级"),
        status: requireEnum(item.status, ["todo", "doing", "done"], "任务状态"),
      };
    });
    return { id, name, tasks };
  });

  return {
    id: requireString(board.id, "看板 ID", 120),
    eventName: normalizeRequiredName(board.eventName, "活动名称", BOARD_LIMITS.eventName),
    deadline: requireIsoDate(board.deadline, "截止时间"),
    teams,
    createdAt: requireIsoDate(board.createdAt, "创建时间"),
    updatedAt: requireIsoDate(board.updatedAt, "更新时间"),
  };
}

export function normalizeDuplicateKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function normalizeRequiredName(value: unknown, label: string, maxLength: number): string {
  const normalized = requireString(value, label, maxLength).trim().replace(/\s+/g, " ");
  if (!normalized) throw new BoardValidationError(`${label}不能为空。`);
  return normalized;
}

function normalizeDate(value: string, label: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new BoardValidationError(`${label}无效。`);
  return new Date(time).toISOString();
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label, 40);
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new BoardValidationError(`${label}格式无效。`);
  }
  return text;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BoardValidationError(`${label}结构无效。`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new BoardValidationError(`${label}结构无效。`);
  return value;
}

function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new BoardValidationError(`${label}必须是文本。`);
  if (value.length > maxLength) throw new BoardValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  return value;
}

function requireEnum<const T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new BoardValidationError(`${label}无效。`);
  }
  return value as T;
}
