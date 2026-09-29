import { normalizeOperationId } from "./contracts";

export const POLL_RESULT_MODES = ["hidden", "live", "final"] as const;
export const POLL_OPTION_STATUSES = ["published", "withdrawn", "removed"] as const;
export type PollResultMode = (typeof POLL_RESULT_MODES)[number];
export type PollOptionStatus = (typeof POLL_OPTION_STATUSES)[number];

export class VoteInputError extends Error {
  constructor(message: string) { super(message); this.name = "VoteInputError"; }
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") throw new VoteInputError(`${label}格式无效。`);
  const result = value.trim().replace(/\s+/g, " ");
  if (required && !result) throw new VoteInputError(`请填写${label}。`);
  if (result.length > max) throw new VoteInputError(`${label}过长。`);
  return result;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new VoteInputError(`${label}格式无效。`);
  return value;
}

export function parseOperationId(value: unknown): string {
  const operationId = normalizeOperationId(value);
  if (!operationId) throw new VoteInputError("operationId 无效。请使用 8–96 位安全标识。",);
  return operationId;
}

export function parsePollInput(input: unknown) {
  const body = input as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VoteInputError("请求体必须是对象。");
  return {
    activityId: isUuid(body.activityId) ? body.activityId : (() => { throw new VoteInputError("活动标识无效。"); })(),
    title: text(body.title, "投票标题", 120, true),
    description: text(body.description ?? "", "投票说明", 4000),
    hostEligible: bool(body.hostEligible ?? false, "主持人投票资格"),
    allowSelfVote: bool(body.allowSelfVote ?? false, "自投规则"),
    resultMode: parseResultMode(body.resultMode ?? "hidden"),
    operationId: parseOperationId(body.operationId),
  };
}

export function parseResultMode(value: unknown): PollResultMode {
  if (typeof value !== "string" || !(POLL_RESULT_MODES as readonly string[]).includes(value)) throw new VoteInputError("结果模式无效。");
  return value as PollResultMode;
}

export function parseOptionInput(input: unknown, allowStatus = false) {
  const body = input as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VoteInputError("请求体必须是对象。");
  const link = body.link === null || body.link === undefined || body.link === "" ? null : text(body.link, "HTTPS 链接", 2048);
  if (link) {
    let url: URL;
    try { url = new URL(link); } catch { throw new VoteInputError("作品链接必须是有效 HTTPS 地址。"); }
    if (url.protocol !== "https:") throw new VoteInputError("作品链接只允许 HTTPS。");
  }
  const status = body.status === undefined ? undefined : parseOptionStatus(body.status);
  if (!allowStatus && status !== undefined) throw new VoteInputError("创建候选项时不能指定状态。");
  return {
    title: text(body.title, "候选项标题", 120, true),
    description: text(body.description ?? "", "候选项说明", 1000),
    link,
    submittedBy: body.submittedBy === null || body.submittedBy === undefined ? null : (isUuid(body.submittedBy) ? body.submittedBy : (() => { throw new VoteInputError("提交者标识无效。"); })()),
    ...(status === undefined ? {} : { status }),
    operationId: parseOperationId(body.operationId),
  };
}

export function parseOptionStatus(value: unknown): PollOptionStatus {
  if (typeof value !== "string" || !(POLL_OPTION_STATUSES as readonly string[]).includes(value)) throw new VoteInputError("候选项状态无效。");
  return value as PollOptionStatus;
}

export function parseVoteInput(input: unknown) {
  const body = input as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VoteInputError("请求体必须是对象。");
  if (!isUuid(body.optionId)) throw new VoteInputError("候选项标识无效。");
  return { optionId: body.optionId, operationId: parseOperationId(body.operationId) };
}

export function parseVoidInput(input: unknown) {
  const body = input as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VoteInputError("请求体必须是对象。");
  if (!isUuid(body.voteId)) throw new VoteInputError("投票标识无效。");
  const reason = text(body.reason, "作废原因", 500, true);
  return { voteId: body.voteId, reason, operationId: parseOperationId(body.operationId) };
}

export function parsePollPatch(input: unknown) {
  const body = input as Record<string, unknown>;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new VoteInputError("请求体必须是对象。");
  if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) throw new VoteInputError("expectedVersion 无效。");
  const close = body.close === true;
  const open = body.open === true;
  if (close && open) throw new VoteInputError("不能同时 open 和 close。");
  return {
    expectedVersion: body.expectedVersion as number,
    close,
    open,
    title: body.title === undefined ? undefined : text(body.title, "投票标题", 120, true),
    description: body.description === undefined ? undefined : text(body.description, "投票说明", 4000),
    hostEligible: body.hostEligible === undefined ? undefined : bool(body.hostEligible, "主持人投票资格"),
    allowSelfVote: body.allowSelfVote === undefined ? undefined : bool(body.allowSelfVote, "自投规则"),
    resultMode: body.resultMode === undefined ? undefined : parseResultMode(body.resultMode),
    operationId: parseOperationId(body.operationId),
  };
}

export function parseOptionPatch(input: unknown) {
  const value = parseOptionInput(input, true);
  if (value.status === undefined) throw new VoteInputError("修改候选项时必须明确指定 status。");
  const expectedVersion = Number((input as Record<string, unknown>).expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new VoteInputError("expectedVersion 无效。");
  return { ...value, status: value.status!, expectedVersion };
}
