import "server-only";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;

export type ActivityInput = { title: string; description: string; deadlineAt?: string | null };

export class ActivityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityInputError";
  }
}

export function parseActivityInput(input: unknown): ActivityInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ActivityInputError("请输入活动信息。");
  }
  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const deadlineAt = typeof record.deadlineAt === "string" && record.deadlineAt.trim() ? record.deadlineAt.trim() : null;
  if (!title || title.length > TITLE_MAX) throw new ActivityInputError(`活动名称需为 1–${TITLE_MAX} 个字符。`);
  if (description.length > DESCRIPTION_MAX) throw new ActivityInputError(`活动说明不能超过 ${DESCRIPTION_MAX} 个字符。`);
  if (deadlineAt && Number.isNaN(Date.parse(deadlineAt))) throw new ActivityInputError("截止时间格式无效。");
  return deadlineAt ? { title, description, deadlineAt } : { title, description };
}
