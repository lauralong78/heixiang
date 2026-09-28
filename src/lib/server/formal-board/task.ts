import "server-only";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type TaskInput = { activityId: string; teamId: string; title: string; description: string };

export class TaskInputError extends Error {
  constructor(message: string) { super(message); this.name = "TaskInputError"; }
}

export function parseTaskInput(input: unknown): TaskInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TaskInputError("请输入任务信息。");
  const r = input as Record<string, unknown>;
  const activityId = typeof r.activityId === "string" ? r.activityId.trim() : "";
  const teamId = typeof r.teamId === "string" ? r.teamId.trim() : "";
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (!UUID.test(activityId) || !UUID.test(teamId)) throw new TaskInputError("活动或队伍标识无效。");
  if (!title || title.length > 200) throw new TaskInputError("任务标题需为 1–200 个字符。");
  if (description.length > 8000) throw new TaskInputError("任务说明不能超过 8000 个字符。");
  return { activityId, teamId, title, description };
}
