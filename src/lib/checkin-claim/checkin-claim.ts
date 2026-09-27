import {
  assertImportSize,
  canPerform,
  LOCAL_CONTRACT_FORMAT,
  LOCAL_CONTRACT_VERSION,
  LOCAL_DEMO_MODE,
  LOCAL_LIMITS,
  MAX_LOCAL_EXPORT_BYTES,
  normalizeBoundedText,
  resolveActivityRole,
  validateLocalEnvelope,
  type ActivityParticipant,
  type ActivityParticipantStatus,
  type LocalActivity,
  type LocalExportEnvelope,
  type LocalIdentity,
} from "@/lib/contracts/local-tools";

export const CHECKIN_STORAGE_KEY = "hackkit.checkin-claim.v1";
export const CHECKIN_TOOL_VERSION = 1 as const;
export const CHECKIN_MAX_ROSTER = 250;
export const CHECKIN_MAX_RECORDS = 1000;
export const CHECKIN_MAX_ERRORS = 1000;

export type CheckinClaimMode = "check-in" | "claim" | "check-in-and-claim";
export type ActionKind = "check-in" | "claim";
export type RosterStatus = Extract<ActivityParticipantStatus, "active" | "withdrawn" | "deleted">;
export type RecordStatus = "completed" | "voided";
export type ErrorCode =
  | "UNKNOWN_CREDENTIAL"
  | "WRONG_ACTIVITY_CREDENTIAL"
  | "ROSTER_INACTIVE"
  | "ACTIVITY_NOT_OPEN"
  | "ALREADY_RECORDED"
  | "INVALID_INPUT"
  | "NOT_AUTHORIZED"
  | "ACTION_NOT_ALLOWED"
  | "VOID_REQUIRES_REASON";

export interface RosterEntry {
  id: string;
  activityId: string;
  identityId: string;
  participantId: string;
  label: string;
  status: RosterStatus;
  credentialDigest: string;
  credentialIssuedAt: string;
  createdAt: string;
  updatedAt: string;
  anonymizedAt: string | null;
}

export interface CheckinRecord {
  id: string;
  activityId: string;
  rosterEntryId: string;
  actionKind: ActionKind;
  status: RecordStatus;
  recordedAt: string;
  recordId: string;
  actorIdentityId: string;
  voidReason: string;
}

export interface CheckinErrorEvent {
  id: string;
  activityId: string;
  code: ErrorCode;
  occurredAt: string;
  actorIdentityId: string;
  rosterEntryId: string | null;
  reason: string;
}

export interface CheckinClaimData {
  toolVersion: typeof CHECKIN_TOOL_VERSION;
  modes: Record<string, CheckinClaimMode>;
  roster: RosterEntry[];
  records: CheckinRecord[];
  errors: CheckinErrorEvent[];
}

export interface CheckinClaimState {
  format: typeof LOCAL_CONTRACT_FORMAT;
  version: typeof LOCAL_CONTRACT_VERSION;
  mode: typeof LOCAL_DEMO_MODE;
  tool: "checkin-claim";
  exportedAt: string;
  activeIdentityId: string | null;
  identities: LocalIdentity[];
  activities: LocalActivity[];
  participants: ActivityParticipant[];
  data: CheckinClaimData;
}

export interface CreatedRosterEntry { entry: RosterEntry; credential: string; identity: LocalIdentity; participant: ActivityParticipant; }

export class CheckinValidationError extends Error {
  code: ErrorCode | "INVALID_BACKUP" | "STORAGE_UNAVAILABLE";
  constructor(message: string, code: CheckinValidationError["code"] = "INVALID_INPUT") {
    super(message);
    this.name = "CheckinValidationError";
    this.code = code;
  }
}

function nowIso() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${cryptoRandom()}`; }
function cryptoRandom() {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint32Array(2); globalThis.crypto.getRandomValues(bytes);
    return `${bytes[0].toString(36)}${bytes[1].toString(36)}`;
  }
  return Math.random().toString(36).slice(2, 14);
}

export function createCheckinState(hostName: string, title: string, mode: CheckinClaimMode): CheckinClaimState {
  const timestamp = nowIso();
  const host: LocalIdentity = { id: id("identity"), displayName: normalizeBoundedText(hostName, "主持人名称", LOCAL_LIMITS.identityName), status: "active", createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
  const activity: LocalActivity = { id: id("activity"), tool: "checkin-claim", title: normalizeBoundedText(title, "活动标题", LOCAL_LIMITS.activityTitle), ownerIdentityId: host.id, status: "draft", demoMode: LOCAL_DEMO_MODE, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
  return { format: LOCAL_CONTRACT_FORMAT, version: LOCAL_CONTRACT_VERSION, mode: LOCAL_DEMO_MODE, tool: "checkin-claim", exportedAt: timestamp, activeIdentityId: host.id, identities: [host], activities: [activity], participants: [], data: { toolVersion: 1, modes: { [activity.id]: mode }, roster: [], records: [], errors: [] } };
}

export async function createRosterEntry(state: CheckinClaimState, activityId: string, actorIdentityId: string, label: string): Promise<{ state: CheckinClaimState; created: CreatedRosterEntry }> {
  const activity = getActivity(state, activityId);
  requireHost(state, activity, actorIdentityId);
  if (!(["draft", "open", "paused"] as string[]).includes(activity.status)) throw new CheckinValidationError("活动当前已冻结，不能修改名单。", "ACTIVITY_NOT_OPEN");
  if (state.data.roster.filter((item) => item.activityId === activityId).length >= CHECKIN_MAX_ROSTER) throw new CheckinValidationError("单个活动最多 250 名名单成员。", "INVALID_INPUT");
  const clean = normalizeBoundedText(label, "名单名称", LOCAL_LIMITS.identityName);
  const timestamp = nowIso();
  const identity: LocalIdentity = { id: id("identity"), displayName: clean, status: "active", createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
  const participant: ActivityParticipant = { id: id("participant"), activityId, identityId: identity.id, role: "participant", status: "active", visibility: "limited", profile: { nickname: clean, skills: [], interests: [], bio: "" }, joinedAt: timestamp, updatedAt: timestamp, withdrawnAt: null, deletedAt: null };
  const credential = `${cryptoRandom().slice(0, 4).toUpperCase()}-${cryptoRandom().slice(0, 4).toUpperCase()}`;
  const entry: RosterEntry = { id: id("roster"), activityId, identityId: identity.id, participantId: participant.id, label: clean, status: "active", credentialDigest: await digestCredential(credential), credentialIssuedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, anonymizedAt: null };
  const next = touch({ ...state, identities: [...state.identities, identity], participants: [...state.participants, participant], data: { ...state.data, roster: [...state.data.roster, entry] } });
  return { state: next, created: { entry, credential, identity, participant } };
}

export function reopenActivity(state: CheckinClaimState, activityId: string, actorIdentityId: string): CheckinClaimState {
  const activity = getActivity(state, activityId); requireHost(state, activity, actorIdentityId);
  if (!(["draft", "paused"] as string[]).includes(activity.status)) throw new CheckinValidationError("只有草稿或暂停活动可以开放。", "INVALID_INPUT");
  return touch({ ...state, activities: state.activities.map((item) => item.id === activityId ? { ...item, status: "open" } : item) });
}

export function closeActivity(state: CheckinClaimState, activityId: string, actorIdentityId: string): CheckinClaimState {
  const activity = getActivity(state, activityId); requireHost(state, activity, actorIdentityId);
  if (!["open", "paused"].includes(activity.status)) throw new CheckinValidationError("当前活动不能关闭。", "INVALID_INPUT");
  return touch({ ...state, activities: state.activities.map((item) => item.id === activityId ? { ...item, status: "closed" } : item) });
}

export async function reissueCredential(state: CheckinClaimState, activityId: string, actorIdentityId: string, rosterEntryId: string): Promise<{ state: CheckinClaimState; credential: string }> {
  const activity = getActivity(state, activityId); requireHost(state, activity, actorIdentityId);
  if (!(["draft", "open", "paused"] as string[]).includes(activity.status)) throw new CheckinValidationError("活动当前已冻结，不能重发凭证。", "ACTIVITY_NOT_OPEN");
  const entry = getRoster(state, rosterEntryId); if (entry.activityId !== activityId) throw new CheckinValidationError("名单不属于当前活动。", "INVALID_INPUT");
  if (entry.status !== "active") throw new CheckinValidationError("只有 active 名单成员可以重发凭证。", "ROSTER_INACTIVE");
  const credential = `${cryptoRandom().slice(0, 4).toUpperCase()}-${cryptoRandom().slice(0, 4).toUpperCase()}`;
  const timestamp = nowIso();
  const nextEntry = { ...entry, credentialDigest: await digestCredential(credential), credentialIssuedAt: timestamp, updatedAt: timestamp };
  return { state: touch({ ...state, data: { ...state.data, roster: state.data.roster.map((item) => item.id === entry.id ? nextEntry : item) } }), credential };
}

export async function recordAction(state: CheckinClaimState, activityId: string, actorIdentityId: string, credential: string, actionKind: ActionKind): Promise<{ state: CheckinClaimState; code: "RECORDED" | "ALREADY_RECORDED"; record: CheckinRecord }> {
  const activity = getActivity(state, activityId);
  const actionError = (code: ErrorCode, reason: string): never => { throw new CheckinValidationError(reason, code); };
  const role = resolveActivityRole(actorIdentityId, activity, state.participants);
  if (!role || !["host", "participant"].includes(role)) actionError("NOT_AUTHORIZED", "当前身份没有录入权限。");
  if (activity.status !== "open") actionError("ACTIVITY_NOT_OPEN", "活动尚未开放或已经关闭。");
  const mode = state.data.modes[activityId];
  if (!mode || (mode === "check-in" && actionKind === "claim") || (mode === "claim" && actionKind === "check-in")) actionError("ACTION_NOT_ALLOWED", "当前活动模式不支持此动作。");
  if (typeof credential !== "string" || !/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(credential.trim())) actionError("INVALID_INPUT", "凭证格式应为 XXXX-XXXX。");
  const digest = await digestCredential(credential.trim().toUpperCase());
  const matches = state.data.roster.filter((item) => item.credentialDigest === digest);
  if (!matches.length) actionError("UNKNOWN_CREDENTIAL", "凭证无效，或不属于当前活动。");
  const entry = matches[0];
  if (entry.activityId !== activityId) actionError("WRONG_ACTIVITY_CREDENTIAL", "这张凭证属于其他活动。");
  if (entry.status !== "active") actionError("ROSTER_INACTIVE", "该名单成员已退出或被移除。");
  if (role === "participant" && entry.identityId !== actorIdentityId) actionError("NOT_AUTHORIZED", "参与者只能提交自己的凭证。");
  const existing = state.data.records.find((item) => item.activityId === activityId && item.rosterEntryId === entry.id && item.actionKind === actionKind && item.status === "completed");
  if (existing) return { state, code: "ALREADY_RECORDED", record: existing };
  if (state.data.records.length >= CHECKIN_MAX_RECORDS) actionError("INVALID_INPUT", "记录数量已达到上限。");
  const timestamp = nowIso();
  const record: CheckinRecord = { id: id("record"), recordId: id("record"), activityId, rosterEntryId: entry.id, actionKind, status: "completed", recordedAt: timestamp, actorIdentityId, voidReason: "" };
  return { state: touch({ ...state, data: { ...state.data, records: [...state.data.records, record] } }), code: "RECORDED", record };
}

export function voidRecord(state: CheckinClaimState, activityId: string, actorIdentityId: string, recordId: string, reason: string): CheckinClaimState {
  const activity = getActivity(state, activityId); requireHost(state, activity, actorIdentityId);
  if (activity.status === "closed" || activity.status === "archived" || activity.status === "deleted") throw new CheckinValidationError("活动关闭后不能撤销记录。", "ACTIVITY_NOT_OPEN");
  let clean: string;
  try { clean = normalizeBoundedText(reason, "撤销原因", LOCAL_LIMITS.reason); } catch { throw new CheckinValidationError("撤销必须填写原因。", "INVALID_INPUT"); }
  if (!state.data.records.some((item) => item.id === recordId && item.status === "completed")) throw new CheckinValidationError("找不到可撤销的记录。", "INVALID_INPUT");
  return touch({ ...state, data: { ...state.data, records: state.data.records.map((item) => item.id === recordId ? { ...item, status: "voided", voidReason: clean } : item) } });
}

export function setRosterStatus(state: CheckinClaimState, activityId: string, actorIdentityId: string, rosterEntryId: string, status: "withdrawn" | "deleted"): CheckinClaimState {
  const activity = getActivity(state, activityId); requireHost(state, activity, actorIdentityId);
  if (!(["draft", "open", "paused"] as string[]).includes(activity.status)) throw new CheckinValidationError("活动当前已冻结，不能修改名单状态。", "ACTIVITY_NOT_OPEN");
  const entry = getRoster(state, rosterEntryId); if (entry.activityId !== activityId) throw new CheckinValidationError("名单不属于当前活动。", "INVALID_INPUT");
  const timestamp = nowIso();
  return touch({ ...state, identities: state.identities.map((item) => item.id === entry.identityId && status === "deleted" ? { ...item, displayName: "已匿名成员", status: "deleted", deletedAt: timestamp, updatedAt: timestamp } : item), participants: state.participants.map((item) => item.id === entry.participantId ? { ...item, status, updatedAt: timestamp, withdrawnAt: status === "withdrawn" ? timestamp : item.withdrawnAt, deletedAt: status === "deleted" ? timestamp : item.deletedAt, profile: status === "deleted" ? { ...item.profile, nickname: "已匿名成员", skills: [], interests: [], bio: "" } : item.profile } : item), data: { ...state.data, roster: state.data.roster.map((item) => item.id === entry.id ? { ...item, status, label: status === "deleted" ? "已匿名成员" : "已退出成员", anonymizedAt: timestamp, updatedAt: timestamp } : item) } });
}

export function addError(state: CheckinClaimState, event: Omit<CheckinErrorEvent, "id">): CheckinClaimState {
  if (state.data.errors.length >= CHECKIN_MAX_ERRORS) return state;
  return touch({ ...state, data: { ...state.data, errors: [...state.data.errors, { ...event, id: id("error") }] } });
}

export function makeBackup(state: CheckinClaimState): LocalExportEnvelope<CheckinClaimData> { return { ...state, exportedAt: nowIso(), data: structuredClone(state.data) }; }
export function serializeBackup(state: CheckinClaimState): string { return JSON.stringify(makeBackup(state), null, 2); }
export function parseBackupText(text: string): CheckinClaimState {
  if (text.length > MAX_LOCAL_EXPORT_BYTES) throw new CheckinValidationError("本地备份不能超过 512 KB。", "INVALID_BACKUP");
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new CheckinValidationError("JSON 备份格式损坏。", "INVALID_BACKUP"); }
  try { const envelope = validateLocalEnvelope(parsed, "checkin-claim"); return validateState(envelope as CheckinClaimState); } catch (error) { throw new CheckinValidationError(error instanceof Error ? error.message : "备份校验失败。", "INVALID_BACKUP"); }
}
export function validateState(state: CheckinClaimState): CheckinClaimState {
  if (state.data?.toolVersion !== CHECKIN_TOOL_VERSION || !state.data.modes || !Array.isArray(state.data.roster) || !Array.isArray(state.data.records) || !Array.isArray(state.data.errors)) throw new CheckinValidationError("签到领取数据结构无效。", "INVALID_BACKUP");
  if (state.data.roster.length > CHECKIN_MAX_ROSTER || state.data.records.length > CHECKIN_MAX_RECORDS || state.data.errors.length > CHECKIN_MAX_ERRORS) throw new CheckinValidationError("签到领取数据数量超过限制。", "INVALID_BACKUP");
  if (state.tool !== "checkin-claim" || state.format !== LOCAL_CONTRACT_FORMAT || state.version !== LOCAL_CONTRACT_VERSION || state.mode !== LOCAL_DEMO_MODE) throw new CheckinValidationError("签到领取备份头无效。", "INVALID_BACKUP");
  const activityIds = new Set(state.activities.map((item) => item.id)); const identityIds = new Set(state.identities.map((item) => item.id)); const participantIds = new Set(state.participants.map((item) => item.id)); const rosterIds = new Set<string>(); const recordIds = new Set<string>(); const errorIds = new Set<string>();
  for (const activity of state.activities) { requireSafeId(activity.id, "活动 ID"); requireIso(activity.createdAt, "活动创建时间"); requireIso(activity.updatedAt, "活动更新时间"); requireText(activity.title, "活动标题", LOCAL_LIMITS.activityTitle); if (!state.data.modes[activity.id] || !["check-in", "claim", "check-in-and-claim"].includes(state.data.modes[activity.id])) throw new CheckinValidationError("活动模式无效。", "INVALID_BACKUP"); }
  if (Object.keys(state.data.modes).some((activityId) => !activityIds.has(activityId))) throw new CheckinValidationError("活动模式包含悬空引用。", "INVALID_BACKUP");
  const seenIdentityIds = new Set<string>(); const seenParticipantIds = new Set<string>();
  for (const identity of state.identities) { requireSafeId(identity.id, "身份 ID"); requireText(identity.displayName, "身份名称", LOCAL_LIMITS.identityName); requireIso(identity.createdAt, "身份创建时间"); requireIso(identity.updatedAt, "身份更新时间"); if (seenIdentityIds.has(identity.id)) throw new CheckinValidationError("身份 ID重复。", "INVALID_BACKUP"); seenIdentityIds.add(identity.id); }
  for (const participant of state.participants) { requireSafeId(participant.id, "参与者 ID"); if (seenParticipantIds.has(participant.id) || !activityIds.has(participant.activityId) || !identityIds.has(participant.identityId)) throw new CheckinValidationError("参与者存在重复 ID、悬空活动或身份引用。", "INVALID_BACKUP"); if (participant.status === "active" && !identityActive(state, participant.identityId)) throw new CheckinValidationError("active 参与者引用了无效身份。", "INVALID_BACKUP"); seenParticipantIds.add(participant.id); }
  for (const entry of state.data.roster) {
    if (Object.prototype.hasOwnProperty.call(entry, "credential") || Object.prototype.hasOwnProperty.call(entry, "rawCredential")) throw new CheckinValidationError("备份不得包含原始凭证。", "INVALID_BACKUP");
    requireSafeId(entry.id, "名单 ID"); requireSafeId(entry.activityId, "名单活动 ID"); requireSafeId(entry.identityId, "名单身份 ID"); requireSafeId(entry.participantId, "名单参与者 ID"); requireText(entry.label, "名单展示名", LOCAL_LIMITS.identityName); requireIso(entry.credentialIssuedAt, "凭证发放时间"); requireIso(entry.createdAt, "名单创建时间"); requireIso(entry.updatedAt, "名单更新时间"); if (entry.anonymizedAt !== null) requireIso(entry.anonymizedAt, "名单匿名时间"); if (rosterIds.has(entry.id) || !activityIds.has(entry.activityId) || !identityIds.has(entry.identityId) || !participantIds.has(entry.participantId) || !state.participants.some((item) => item.id === entry.participantId && item.activityId === entry.activityId && item.identityId === entry.identityId)) throw new CheckinValidationError("名单数据存在重复 ID 或悬空引用。", "INVALID_BACKUP"); if (!/^[a-f0-9]{64}$/.test(entry.credentialDigest)) throw new CheckinValidationError("凭证摘要格式无效。", "INVALID_BACKUP"); rosterIds.add(entry.id);
  }
  const completedKeys = new Set<string>();
  for (const record of state.data.records) { requireSafeId(record.id, "记录 ID"); requireSafeId(record.recordId, "业务记录 ID"); requireSafeId(record.activityId, "记录活动 ID"); requireSafeId(record.rosterEntryId, "记录名单 ID"); requireSafeId(record.actorIdentityId, "记录操作者 ID"); requireIso(record.recordedAt, "记录时间"); requireText(record.voidReason, "撤销原因", LOCAL_LIMITS.reason, true); const duplicateId = recordIds.has(record.id) || recordIds.has(record.recordId); recordIds.add(record.id); recordIds.add(record.recordId); if (duplicateId || !rosterIds.has(record.rosterEntryId) || !activityIds.has(record.activityId) || !identityIds.has(record.actorIdentityId) || state.data.roster.find((entry) => entry.id === record.rosterEntryId)?.activityId !== record.activityId || !["check-in", "claim"].includes(record.actionKind) || !["completed", "voided"].includes(record.status)) throw new CheckinValidationError("签到记录存在重复 ID、悬空引用或非法枚举。", "INVALID_BACKUP"); if (record.status === "voided" && !record.voidReason) throw new CheckinValidationError("已撤销记录必须包含原因。", "INVALID_BACKUP"); if (record.status === "completed") { const key = `${record.activityId}:${record.rosterEntryId}:${record.actionKind}`; if (completedKeys.has(key)) throw new CheckinValidationError("业务唯一键重复。", "INVALID_BACKUP"); completedKeys.add(key); } }
  const allowedErrors: ErrorCode[] = ["UNKNOWN_CREDENTIAL", "WRONG_ACTIVITY_CREDENTIAL", "ROSTER_INACTIVE", "ACTIVITY_NOT_OPEN", "ALREADY_RECORDED", "INVALID_INPUT", "NOT_AUTHORIZED", "ACTION_NOT_ALLOWED", "VOID_REQUIRES_REASON"];
  for (const event of state.data.errors) { requireSafeId(event.id, "异常事件 ID"); requireSafeId(event.activityId, "异常活动 ID"); requireSafeId(event.actorIdentityId, "异常操作者 ID"); requireIso(event.occurredAt, "异常时间"); requireText(event.reason, "异常原因", LOCAL_LIMITS.reason); if (event.rosterEntryId !== null) requireSafeId(event.rosterEntryId, "异常名单 ID"); if (errorIds.has(event.id) || !activityIds.has(event.activityId) || !identityIds.has(event.actorIdentityId) || (event.rosterEntryId !== null && !rosterIds.has(event.rosterEntryId)) || !allowedErrors.includes(event.code)) throw new CheckinValidationError("异常事件存在重复 ID、悬空引用或非法错误码。", "INVALID_BACKUP"); errorIds.add(event.id); }
  const modes: Record<string, CheckinClaimMode> = {};
  for (const activity of state.activities) modes[activity.id] = state.data.modes[activity.id];
  const roster = state.data.roster.map((entry) => ({
    id: entry.id, activityId: entry.activityId, identityId: entry.identityId, participantId: entry.participantId,
    label: entry.label, status: entry.status, credentialDigest: entry.credentialDigest,
    credentialIssuedAt: entry.credentialIssuedAt, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    anonymizedAt: entry.anonymizedAt,
  }));
  const records = state.data.records.map((record) => ({
    id: record.id, activityId: record.activityId, rosterEntryId: record.rosterEntryId, actionKind: record.actionKind,
    status: record.status, recordedAt: record.recordedAt, recordId: record.recordId,
    actorIdentityId: record.actorIdentityId, voidReason: record.voidReason,
  }));
  const errors = state.data.errors.map((event) => ({
    id: event.id, activityId: event.activityId, code: event.code, occurredAt: event.occurredAt,
    actorIdentityId: event.actorIdentityId, rosterEntryId: event.rosterEntryId, reason: event.reason,
  }));
  return { ...state, data: { toolVersion: CHECKIN_TOOL_VERSION, modes, roster, records, errors } };
}

function requireSafeId(value: unknown, label: string): string { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw new CheckinValidationError(`${label}格式无效。`, "INVALID_BACKUP"); return value; }
function requireIso(value: unknown, label: string): string { if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new CheckinValidationError(`${label}格式无效。`, "INVALID_BACKUP"); return value; }
function requireText(value: unknown, label: string, maxLength: number, allowEmpty = false): string { if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && !value.trim())) throw new CheckinValidationError(`${label}无效。`, "INVALID_BACKUP"); return value; }
function identityActive(state: CheckinClaimState, identityId: string) { return state.identities.some((item) => item.id === identityId && item.status === "active"); }
export function csvForActivity(state: CheckinClaimState, activityId: string): string {
  const activity = getActivity(state, activityId); const header = ["activityId", "activityTitle", "rosterEntryId", "participantLabel", "actionKind", "status", "recordedAt", "recordId", "voidReason"];
  const rows = state.data.records.filter((item) => item.activityId === activityId).map((record) => { const entry = getRoster(state, record.rosterEntryId); return [activity.id, activity.title, entry.id, entry.label, record.actionKind, record.status, record.recordedAt, record.recordId, record.voidReason]; });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export async function digestCredential(value: string): Promise<string> { const data = new TextEncoder().encode(value.trim().toUpperCase()); const digest = await globalThis.crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function csvCell(value: string) { const safe = /^[=+\-@]/.test(value) ? `'${value}` : value; return `"${safe.replace(/"/g, '""')}"`; }
function touch<T extends CheckinClaimState>(state: T): T { const timestamp = nowIso(); return { ...state, exportedAt: timestamp, activities: state.activities.map((item) => ({ ...item, updatedAt: item.updatedAt })) } as T; }
function getActivity(state: CheckinClaimState, activityId: string) { const activity = state.activities.find((item) => item.id === activityId); if (!activity) throw new CheckinValidationError("找不到活动。", "INVALID_INPUT"); return activity; }
function getRoster(state: CheckinClaimState, rosterEntryId: string) { const entry = state.data.roster.find((item) => item.id === rosterEntryId); if (!entry) throw new CheckinValidationError("找不到名单成员。", "INVALID_INPUT"); return entry; }
function requireHost(state: CheckinClaimState, activity: LocalActivity, actorIdentityId: string) { if (!canPerform("manage-activity", actorIdentityId, activity, state.participants)) throw new CheckinValidationError("只有主持人可以执行此操作。", "NOT_AUTHORIZED"); }

export function actionLabel(action: ActionKind) { return action === "check-in" ? "签到" : "领取"; }
export function statusLabel(status: RecordStatus) { return status === "completed" ? "已完成" : "已撤销"; }
export function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
export { assertImportSize };
