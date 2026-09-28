import "server-only";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TeamInput = { activityId: string; name: string; description: string };

export class TeamInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamInputError";
  }
}

export function parseTeamInput(input: unknown): TeamInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TeamInputError("请输入队伍信息。");
  const record = input as Record<string, unknown>;
  const activityId = typeof record.activityId === "string" ? record.activityId.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!UUID_PATTERN.test(activityId)) throw new TeamInputError("活动标识无效。");
  if (!name || name.length > 120) throw new TeamInputError("队伍名称需为 1–120 个字符。");
  if (description.length > 4000) throw new TeamInputError("队伍说明不能超过 4000 个字符。");
  return { activityId, name, description };
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}
