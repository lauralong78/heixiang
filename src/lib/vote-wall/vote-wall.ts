import {
  LOCAL_CONTRACT_FORMAT,
  LOCAL_CONTRACT_VERSION,
  LOCAL_DEMO_MODE,
  LOCAL_LIMITS,
  MAX_LOCAL_EXPORT_BYTES,
  assertImportSize as assertSharedImportSize,
  normalizeBoundedText,
  resolveActivityRole,
  validateLocalEnvelope,
  type ActivityParticipant,
  type LocalActivity,
  type LocalCommandMeta,
  type LocalExportEnvelope,
  type LocalIdentity,
} from "@/lib/contracts/local-tools";

export const VOTE_WALL_STORAGE_KEY = "hackkit.vote-wall.v1";
export const VOTE_WALL_TOOL = "vote-wall" as const;
export const VOTE_WALL_LIMITS = {
  artworks: 500,
  title: 120,
  description: 1_000,
  link: 2_048,
  votes: 1_000,
  operations: 2_000,
  audits: 2_000,
} as const;

export type ResultMode = "hidden" | "live" | "final";
export type ArtworkStatus = "published" | "withdrawn" | "removed";
export type VoteStatus = "active" | "voided";
export type VoteErrorCode =
  | "ACTIVITY_NOT_OPEN" | "NOT_ELIGIBLE" | "VIEWER_CANNOT_VOTE" | "HOST_NOT_ELIGIBLE"
  | "SELF_VOTE_NOT_ALLOWED" | "ARTWORK_NOT_AVAILABLE" | "ALREADY_VOTED" | "CLOSED_FROZEN"
  | "NOT_HOST" | "VOTE_NOT_FOUND" | "INVALID_REASON";

export interface VoteWallSettings {
  activityId: string;
  choiceMode: "single-choice";
  hostEligible: boolean;
  allowSelfVote: boolean;
  resultMode: ResultMode;
}

export interface VoteWallArtwork {
  id: string;
  activityId: string;
  submitterIdentityId: string;
  title: string;
  description: string;
  link: string | null;
  status: ArtworkStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VoteWallVote {
  id: string;
  activityId: string;
  voterIdentityId: string;
  artworkId: string;
  status: VoteStatus;
  castAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface VoteWallOperation {
  activityId: string;
  operationId: string;
  fingerprint: string;
  code: string;
  result: unknown;
  recordedAt: string;
}

export interface VoteWallAudit {
  id: string;
  activityId: string;
  kind: "vote-cast" | "vote-voided" | "activity-closed";
  actorIdentityId: string;
  targetId: string | null;
  at: string;
  reason: string | null;
}

export interface VoteWallData {
  settings: VoteWallSettings[];
  artworks: VoteWallArtwork[];
  votes: VoteWallVote[];
  operations: VoteWallOperation[];
  audits: VoteWallAudit[];
}

export interface VoteWallSnapshot {
  identities: LocalIdentity[];
  activities: LocalActivity[];
  participants: ActivityParticipant[];
  activeIdentityId: string | null;
  data: VoteWallData;
}

export interface VoteResult {
  code: "RECORDED" | "ALREADY_VOTED";
  vote: VoteWallVote;
  message: string;
}

export class VoteWallValidationError extends Error {
  constructor(message: string) { super(message); this.name = "VoteWallValidationError"; }
}

export class VoteWallCommandError extends VoteWallValidationError {
  readonly code: VoteErrorCode;
  constructor(code: VoteErrorCode, message: string) { super(message); this.name = "VoteWallCommandError"; this.code = code; }
}

export function createEmptyData(): VoteWallData {
  return { settings: [], artworks: [], votes: [], operations: [], audits: [] };
}

export function createSettings(activityId: string): VoteWallSettings {
  return { activityId, choiceMode: "single-choice", hostEligible: false, allowSelfVote: false, resultMode: "hidden" };
}

export function createId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function validateHttpsUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > VOTE_WALL_LIMITS.link) throw new VoteWallValidationError("作品链接格式无效或过长。");
  let url: URL;
  try { url = new URL(value); } catch { throw new VoteWallValidationError("作品链接必须是有效 HTTPS 地址。"); }
  if (url.protocol !== "https:") throw new VoteWallValidationError("作品链接只允许 HTTPS，已拒绝危险协议。");
  return url.toString();
}

export function makeEnvelope(snapshot: VoteWallSnapshot, exportedAt = new Date().toISOString()): LocalExportEnvelope<VoteWallData> {
  return {
    format: LOCAL_CONTRACT_FORMAT, version: LOCAL_CONTRACT_VERSION, mode: LOCAL_DEMO_MODE, tool: VOTE_WALL_TOOL,
    exportedAt, activeIdentityId: snapshot.activeIdentityId, identities: snapshot.identities,
    activities: snapshot.activities, participants: snapshot.participants, data: snapshot.data,
  };
}

export function assertImportSize(size: number): void { assertSharedImportSize(size); }

export function parseBackupText(text: string): VoteWallSnapshot {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new VoteWallValidationError("文件不是有效 JSON。"); }
  const envelope = validateLocalEnvelope(value, VOTE_WALL_TOOL);
  try {
    return { identities: envelope.identities, activities: envelope.activities, participants: envelope.participants, activeIdentityId: envelope.activeIdentityId, data: validateData(envelope.data, envelope.identities, envelope.activities, envelope.participants) };
  } catch (error) {
    if (error instanceof VoteWallValidationError) throw error;
    throw new VoteWallValidationError(error instanceof Error ? error.message : "投票墙数据无效。");
  }
}

export function validateSnapshot(snapshot: VoteWallSnapshot): VoteWallSnapshot {
  return { ...snapshot, data: validateData(snapshot.data, snapshot.identities, snapshot.activities, snapshot.participants) };
}

export function addArtwork(data: VoteWallData, input: Omit<VoteWallArtwork, "id" | "createdAt" | "updatedAt" | "status">, now = new Date().toISOString()): VoteWallData {
  const title = normalizeBoundedText(input.title, "作品标题", VOTE_WALL_LIMITS.title);
  const description = input.description.trim().replace(/\s+/g, " ");
  if (description.length > VOTE_WALL_LIMITS.description) throw new VoteWallValidationError("作品说明过长。");
  const link = validateHttpsUrl(input.link);
  return { ...data, artworks: [...data.artworks, { ...input, id: createId("art"), title, description, link, status: "published", createdAt: now, updatedAt: now }] };
}

export function eligibility(activity: LocalActivity, actorId: string, participants: readonly ActivityParticipant[], settings: VoteWallSettings, artwork: VoteWallArtwork): { ok: true } | { ok: false; code: VoteErrorCode; message: string } {
  if (activity.status !== "open" && activity.status !== "paused") return { ok: false, code: activity.status === "closed" ? "CLOSED_FROZEN" : "ACTIVITY_NOT_OPEN", message: "活动尚未开放投票或已经关闭。" };
  if (artwork.status !== "published") return { ok: false, code: "ARTWORK_NOT_AVAILABLE", message: "该作品当前不可投票。" };
  const role = resolveActivityRole(actorId, activity, participants);
  if (role === "viewer") return { ok: false, code: "VIEWER_CANNOT_VOTE", message: "观察者只能查看，不能投票。" };
  if (role === "host" && !settings.hostEligible) return { ok: false, code: "HOST_NOT_ELIGIBLE", message: "主持人默认不能投票；请在 draft 阶段开启主持人资格。" };
  if (!role || (role !== "host" && role !== "participant")) return { ok: false, code: "NOT_ELIGIBLE", message: "只有活动内 active 合资格身份可以投票。" };
  if (artwork.submitterIdentityId === actorId && !settings.allowSelfVote) return { ok: false, code: "SELF_VOTE_NOT_ALLOWED", message: "当前规则不允许给自己的作品投票。" };
  return { ok: true };
}

export function castVote(snapshot: VoteWallSnapshot, activityId: string, artworkId: string, meta: LocalCommandMeta, now = new Date().toISOString()): { snapshot: VoteWallSnapshot; result: VoteResult } {
  const activity = requireActivity(snapshot, activityId);
  const settings = requireSettings(snapshot.data, activityId);
  const artwork = snapshot.data.artworks.find((item) => item.id === artworkId && item.activityId === activityId);
  if (!artwork) throw new VoteWallCommandError("ARTWORK_NOT_AVAILABLE", "找不到该活动的作品。");
  const fingerprint = JSON.stringify({ activityId, artworkId, actorIdentityId: meta.actorIdentityId });
  const operation = findOperation(snapshot.data, activityId, meta, fingerprint);
  if (operation) return { snapshot, result: operation.result as VoteResult };
  const existing = snapshot.data.votes.find((vote) => vote.activityId === activityId && vote.voterIdentityId === meta.actorIdentityId);
  if (existing) {
    const result: VoteResult = { code: "ALREADY_VOTED", vote: existing, message: "ALREADY_VOTED：每位身份每个活动只能投一票。" };
    return recordOperation(snapshot, activityId, meta, fingerprint, result, now);
  }
  const check = eligibility(activity, meta.actorIdentityId, snapshot.participants, settings, artwork);
  if (!check.ok) throw new VoteWallCommandError(check.code, check.message);
  const vote: VoteWallVote = { id: createId("vote"), activityId, voterIdentityId: meta.actorIdentityId, artworkId, status: "active", castAt: now, voidedAt: null, voidReason: null };
  const result: VoteResult = { code: "RECORDED", vote, message: "投票已记录。" };
  const next = { ...snapshot, data: { ...snapshot.data, votes: [...snapshot.data.votes, vote], audits: [...snapshot.data.audits, { id: createId("audit"), activityId, kind: "vote-cast" as const, actorIdentityId: meta.actorIdentityId, targetId: vote.id, at: now, reason: null }] } };
  return recordOperation(next, activityId, meta, fingerprint, result, now);
}

export function voidVote(snapshot: VoteWallSnapshot, activityId: string, voteId: string, reason: string, meta: LocalCommandMeta, now = new Date().toISOString()): VoteWallSnapshot {
  const activity = requireActivity(snapshot, activityId);
  if (activity.status !== "open" && activity.status !== "paused") throw new VoteWallCommandError("CLOSED_FROZEN", "活动关闭后不能修改投票。");
  if (resolveActivityRole(meta.actorIdentityId, activity, snapshot.participants) !== "host") throw new VoteWallCommandError("NOT_HOST", "只有主持人可以作废投票。");
  const normalizedReason = normalizeBoundedText(reason, "作废原因", LOCAL_LIMITS.reason);
  const fingerprint = JSON.stringify({ activityId, voteId, reason: normalizedReason, actorIdentityId: meta.actorIdentityId });
  const operation = findOperation(snapshot.data, activityId, meta, fingerprint);
  if (operation) return snapshot;
  const vote = snapshot.data.votes.find((item) => item.id === voteId && item.activityId === activityId);
  if (!vote) throw new VoteWallCommandError("VOTE_NOT_FOUND", "找不到该票。");
  if (vote.status === "voided") return snapshot;
  const updated = { ...vote, status: "voided" as const, voidedAt: now, voidReason: normalizedReason };
  const next = { ...snapshot, data: { ...snapshot.data, votes: snapshot.data.votes.map((item) => item.id === voteId ? updated : item), audits: [...snapshot.data.audits, { id: createId("audit"), activityId, kind: "vote-voided" as const, actorIdentityId: meta.actorIdentityId, targetId: voteId, at: now, reason: normalizedReason }] } };
  return { ...next, data: { ...next.data, operations: [...next.data.operations, { activityId, operationId: meta.operationId, fingerprint, code: "VOIDED", result: { ok: true }, recordedAt: now }] } };
}

export function closeActivity(snapshot: VoteWallSnapshot, activityId: string, reason: string, meta: LocalCommandMeta, now = new Date().toISOString()): VoteWallSnapshot {
  const activity = requireActivity(snapshot, activityId);
  if (resolveActivityRole(meta.actorIdentityId, activity, snapshot.participants) !== "host") throw new VoteWallCommandError("NOT_HOST", "只有主持人可以关闭活动。");
  if (activity.status === "closed") return snapshot;
  if (activity.status !== "open" && activity.status !== "paused") throw new VoteWallCommandError("ACTIVITY_NOT_OPEN", "只有 open 或 paused 活动可以关闭。");
  const normalizedReason = reason.trim().replace(/\s+/g, " ");
  if (normalizedReason.length > LOCAL_LIMITS.reason) throw new VoteWallValidationError("关闭原因过长。");
  const fingerprint = JSON.stringify({ activityId, reason: normalizedReason, actorIdentityId: meta.actorIdentityId });
  if (findOperation(snapshot.data, activityId, meta, fingerprint)) return snapshot;
  const nextActivity = { ...activity, status: "closed" as const, updatedAt: now };
  const next = { ...snapshot, activities: snapshot.activities.map((item) => item.id === activityId ? nextActivity : item), data: { ...snapshot.data, audits: [...snapshot.data.audits, { id: createId("audit"), activityId, kind: "activity-closed" as const, actorIdentityId: meta.actorIdentityId, targetId: null, at: now, reason: normalizedReason || null }] } };
  return { ...next, data: { ...next.data, operations: [...next.data.operations, { activityId, operationId: meta.operationId, fingerprint, code: "CLOSED", result: { ok: true }, recordedAt: now }] } };
}

export function resultFor(snapshot: VoteWallSnapshot, activityId: string, artworkId: string): { mode: ResultMode; recorded: boolean; count: number | null; voidCount: number } {
  const settings = requireSettings(snapshot.data, activityId);
  const activity = requireActivity(snapshot, activityId);
  const votes = snapshot.data.votes.filter((vote) => vote.activityId === activityId && vote.artworkId === artworkId);
  const voidCount = votes.filter((vote) => vote.status === "voided").length;
  const mode = settings.resultMode;
  const visible = mode === "live" || (mode === "final" && activity.status === "closed");
  return { mode, recorded: votes.length > 0, count: visible ? votes.filter((vote) => vote.status === "active").length : null, voidCount };
}

function recordOperation(snapshot: VoteWallSnapshot, activityId: string, meta: LocalCommandMeta, fingerprint: string, result: unknown, now: string): { snapshot: VoteWallSnapshot; result: VoteResult } {
  const operation: VoteWallOperation = { activityId, operationId: meta.operationId, fingerprint, code: (result as { code?: string }).code ?? "OK", result, recordedAt: now };
  return { snapshot: { ...snapshot, data: { ...snapshot.data, operations: [...snapshot.data.operations, operation] } }, result: result as VoteResult };
}

function findOperation(data: VoteWallData, activityId: string, meta: LocalCommandMeta, fingerprint: string): VoteWallOperation | undefined {
  const found = data.operations.find((item) => item.activityId === activityId && item.operationId === meta.operationId);
  if (!found) return undefined;
  if (found.fingerprint !== fingerprint) throw new VoteWallValidationError("同一 operationId 不能复用不同参数。");
  return found;
}

function requireActivity(snapshot: VoteWallSnapshot, id: string): LocalActivity { const activity = snapshot.activities.find((item) => item.id === id && item.tool === VOTE_WALL_TOOL); if (!activity) throw new VoteWallValidationError("找不到活动。"); return activity; }
function requireSettings(data: VoteWallData, id: string): VoteWallSettings { const settings = data.settings.find((item) => item.activityId === id); if (!settings) throw new VoteWallValidationError("找不到活动规则。"); return settings; }

function validateData(value: unknown, identities: readonly LocalIdentity[], activities: readonly LocalActivity[], participants: readonly ActivityParticipant[]): VoteWallData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoteWallValidationError("投票墙数据必须是对象。");
  const raw = value as Record<string, unknown>;
  const settings = requireArray(raw.settings, "投票规则").map((item) => validateSettings(item, activities));
  const artworks = requireArray(raw.artworks, "作品").map((item) => validateArtwork(item, identities, activities));
  const votes = requireArray(raw.votes, "投票").map((item) => validateVote(item, identities, activities, artworks));
  const operations = requireArray(raw.operations, "操作记录").map((item) => validateOperation(item, activities));
  const audits = requireArray(raw.audits, "审计记录").map((item) => validateAudit(item, identities, activities));
  if (settings.length > activities.length || artworks.length > VOTE_WALL_LIMITS.artworks || votes.length > VOTE_WALL_LIMITS.votes || operations.length > VOTE_WALL_LIMITS.operations || audits.length > VOTE_WALL_LIMITS.audits) throw new VoteWallValidationError("投票墙记录数量超出限制。");
  unique(settings.map((item) => item.activityId), "活动规则"); unique(artworks.map((item) => item.id), "作品"); unique(votes.map((item) => item.id), "投票"); unique(operations.map((item) => `${item.activityId}:${item.operationId}`), "操作"); unique(audits.map((item) => item.id), "审计");
  unique(votes.map((item) => `${item.activityId}:${item.voterIdentityId}`), "同一活动的投票身份");
  for (const activity of activities.filter((item) => item.tool === VOTE_WALL_TOOL)) if (!settings.some((item) => item.activityId === activity.id)) throw new VoteWallValidationError("活动缺少投票规则。");
  void participants;
  return { settings, artworks, votes, operations, audits };
}

function validateSettings(value: unknown, activities: readonly LocalActivity[]): VoteWallSettings { const item = record(value, "投票规则"); const activityId = safeId(item.activityId, "活动 ID"); if (!activities.some((activity) => activity.id === activityId && activity.tool === VOTE_WALL_TOOL)) throw new VoteWallValidationError("投票规则引用了不存在的活动。"); return { activityId, choiceMode: enumValue(item.choiceMode, ["single-choice"], "投票模式"), hostEligible: booleanValue(item.hostEligible, "主持人资格"), allowSelfVote: booleanValue(item.allowSelfVote, "自投规则"), resultMode: enumValue(item.resultMode, ["hidden", "live", "final"], "结果模式") }; }
function validateArtwork(value: unknown, identities: readonly LocalIdentity[], activities: readonly LocalActivity[]): VoteWallArtwork { const item = record(value, "作品"); const activityId = safeId(item.activityId, "作品活动 ID"); const submitterIdentityId = safeId(item.submitterIdentityId, "作品提交者 ID"); if (!identities.some((x) => x.id === submitterIdentityId)) throw new VoteWallValidationError("作品提交者不存在。"); if (!activities.some((x) => x.id === activityId && x.tool === VOTE_WALL_TOOL)) throw new VoteWallValidationError("作品所属活动不存在。"); const title = normalizeBoundedText(item.title, "作品标题", VOTE_WALL_LIMITS.title); const description = stringValue(item.description, "作品说明", VOTE_WALL_LIMITS.description).trim().replace(/\s+/g, " "); return { id: safeId(item.id, "作品 ID"), activityId, submitterIdentityId, title, description, link: validateHttpsUrl(item.link), status: enumValue(item.status, ["published", "withdrawn", "removed"], "作品状态"), createdAt: iso(item.createdAt, "作品创建时间"), updatedAt: iso(item.updatedAt, "作品更新时间") }; }
function validateVote(value: unknown, identities: readonly LocalIdentity[], activities: readonly LocalActivity[], artworks: readonly VoteWallArtwork[]): VoteWallVote { const item = record(value, "投票"); const activityId = safeId(item.activityId, "投票活动 ID"); const voterIdentityId = safeId(item.voterIdentityId, "投票身份 ID"); const artworkId = safeId(item.artworkId, "投票作品 ID"); if (!identities.some((x) => x.id === voterIdentityId)) throw new VoteWallValidationError("投票身份不存在。"); if (!activities.some((x) => x.id === activityId && x.tool === VOTE_WALL_TOOL)) throw new VoteWallValidationError("投票活动不存在。"); if (!artworks.some((x) => x.id === artworkId && x.activityId === activityId)) throw new VoteWallValidationError("投票引用了错误的作品。"); return { id: safeId(item.id, "投票 ID"), activityId, voterIdentityId, artworkId, status: enumValue(item.status, ["active", "voided"], "投票状态"), castAt: iso(item.castAt, "投票时间"), voidedAt: item.voidedAt === null ? null : iso(item.voidedAt, "作废时间"), voidReason: item.voidReason === null ? null : normalizeBoundedText(item.voidReason, "作废原因", LOCAL_LIMITS.reason) }; }
function validateOperation(value: unknown, activities: readonly LocalActivity[]): VoteWallOperation { const item = record(value, "操作记录"); const activityId = safeId(item.activityId, "操作活动 ID"); if (!activities.some((x) => x.id === activityId && x.tool === VOTE_WALL_TOOL)) throw new VoteWallValidationError("操作记录引用了不存在的活动。"); return { activityId, operationId: safeId(item.operationId, "操作 ID"), fingerprint: stringValue(item.fingerprint, "操作指纹", 500), code: stringValue(item.code, "操作结果", 80), result: item.result, recordedAt: iso(item.recordedAt, "操作时间") }; }
function validateAudit(value: unknown, identities: readonly LocalIdentity[], activities: readonly LocalActivity[]): VoteWallAudit { const item = record(value, "审计记录"); const actorIdentityId = safeId(item.actorIdentityId, "审计身份 ID"); const activityId = safeId(item.activityId, "审计活动 ID"); if (!identities.some((x) => x.id === actorIdentityId) || !activities.some((x) => x.id === activityId)) throw new VoteWallValidationError("审计记录引用无效。"); return { id: safeId(item.id, "审计 ID"), activityId, kind: enumValue(item.kind, ["vote-cast", "vote-voided", "activity-closed"], "审计类型"), actorIdentityId, targetId: item.targetId === null ? null : safeId(item.targetId, "审计目标 ID"), at: iso(item.at, "审计时间"), reason: item.reason === null ? null : normalizeBoundedText(item.reason, "审计原因", LOCAL_LIMITS.reason) }; }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new VoteWallValidationError(`${label}结构无效。`); return value as Record<string, unknown>; }
function requireArray(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new VoteWallValidationError(`${label}结构无效。`); return value; }
function stringValue(value: unknown, label: string, max: number): string { if (typeof value !== "string" || value.length > max) throw new VoteWallValidationError(`${label}无效。`); return value; }
function safeId(value: unknown, label: string): string { const id = stringValue(value, label, LOCAL_LIMITS.id); if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) throw new VoteWallValidationError(`${label}格式无效。`); return id; }
function iso(value: unknown, label: string): string { const text = stringValue(value, label, 40); if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) throw new VoteWallValidationError(`${label}格式无效。`); return text; }
function booleanValue(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new VoteWallValidationError(`${label}无效。`); return value; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T { if (typeof value !== "string" || !allowed.includes(value as T)) throw new VoteWallValidationError(`${label}无效。`); return value as T; }
function unique(values: string[], label: string): void { if (new Set(values).size !== values.length) throw new VoteWallValidationError(`${label}存在重复 ID。`); }

export { MAX_LOCAL_EXPORT_BYTES };
