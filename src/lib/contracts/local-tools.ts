/**
 * Shared, runtime-safe contracts for the third-stage local demo tools.
 *
 * This module deliberately has no browser, storage, network, or Next.js
 * imports. The identity and permission checks are UX/data-integrity guards in
 * same-browser demo mode, not authentication or security boundaries.
 */

export const LOCAL_CONTRACT_FORMAT = "hackkit-local-tools";
export const LOCAL_CONTRACT_VERSION = 1 as const;
export const LOCAL_DEMO_MODE = "same-browser-demo" as const;
export const MAX_LOCAL_EXPORT_BYTES = 512 * 1024;

export const LOCAL_LIMITS = {
  identityName: 80,
  activityTitle: 120,
  id: 120,
  profileBio: 240,
  profileTag: 32,
  profileTags: 12,
  identities: 50,
  activities: 20,
  participants: 500,
  operationId: 120,
  reason: 240,
} as const;

export type LocalTool = "team-match" | "vote-wall" | "checkin-claim";
export type LocalDemoMode = typeof LOCAL_DEMO_MODE;
export type IdentityStatus = "active" | "deleted";
export type ActivityStatus = "draft" | "open" | "paused" | "closed" | "archived" | "deleted";
export type ActivityParticipantStatus = "active" | "withdrawn" | "deleted";
export type ActivityRole = "host" | "participant" | "viewer";
export type ProfileVisibility = "public" | "limited" | "private";

export interface LocalIdentity {
  id: string;
  displayName: string;
  status: IdentityStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalActivity {
  id: string;
  tool: LocalTool;
  title: string;
  ownerIdentityId: string;
  status: ActivityStatus;
  demoMode: LocalDemoMode;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalParticipantProfile {
  nickname: string;
  skills: string[];
  interests: string[];
  bio: string;
}

export interface ActivityParticipant {
  id: string;
  activityId: string;
  identityId: string;
  role: Exclude<ActivityRole, "host">;
  status: ActivityParticipantStatus;
  visibility: ProfileVisibility;
  profile: LocalParticipantProfile;
  joinedAt: string;
  updatedAt: string;
  withdrawnAt: string | null;
  deletedAt: string | null;
}

export interface LocalCommandMeta {
  operationId: string;
  actorIdentityId: string;
  issuedAt: string;
}

export interface LocalExportEnvelope<T> {
  format: typeof LOCAL_CONTRACT_FORMAT;
  version: typeof LOCAL_CONTRACT_VERSION;
  mode: typeof LOCAL_DEMO_MODE;
  tool: LocalTool;
  exportedAt: string;
  activeIdentityId: string | null;
  identities: LocalIdentity[];
  activities: LocalActivity[];
  participants: ActivityParticipant[];
  data: T;
}

export type LocalPermission =
  | "view-activity"
  | "manage-activity"
  | "manage-participants"
  | "submit-self"
  | "withdraw-self"
  | "delete-self"
  | "manage-records"
  | "view-results"
  | "export-activity"
  | "restore-activity";

export const ROLE_PERMISSIONS: Readonly<Record<ActivityRole, readonly LocalPermission[]>> = {
  host: [
    "view-activity",
    "manage-activity",
    "manage-participants",
    "submit-self",
    "withdraw-self",
    "delete-self",
    "manage-records",
    "view-results",
    "export-activity",
    "restore-activity",
  ],
  participant: [
    "view-activity",
    "submit-self",
    "withdraw-self",
    "delete-self",
    "view-results",
  ],
  viewer: ["view-activity", "view-results"],
};

export class LocalContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalContractValidationError";
  }
}

export function canTransitionActivity(from: ActivityStatus, to: ActivityStatus): boolean {
  return ACTIVITY_TRANSITIONS[from].includes(to);
}

export function canTransitionParticipant(from: ActivityParticipantStatus, to: ActivityParticipantStatus): boolean {
  return PARTICIPANT_TRANSITIONS[from].includes(to);
}

export function resolveActivityRole(
  actorIdentityId: string,
  activity: LocalActivity,
  participants: readonly ActivityParticipant[],
): ActivityRole | null {
  if (activity.ownerIdentityId === actorIdentityId) return "host";
  const participant = participants.find(
    (item) => item.activityId === activity.id && item.identityId === actorIdentityId,
  );
  if (!participant || participant.status !== "active") return null;
  return participant.role;
}

export function canPerform(
  permission: LocalPermission,
  actorIdentityId: string,
  activity: LocalActivity,
  participants: readonly ActivityParticipant[],
): boolean {
  const role = resolveActivityRole(actorIdentityId, activity, participants);
  return role !== null && ROLE_PERMISSIONS[role].includes(permission);
}

export function canActOnOwnParticipant(
  permission: Extract<LocalPermission, "submit-self" | "withdraw-self" | "delete-self">,
  actorIdentityId: string,
  participant: ActivityParticipant,
): boolean {
  return participant.identityId === actorIdentityId
    && participant.status === "active"
    && ROLE_PERMISSIONS[participant.role].includes(permission);
}

export function assertImportSize(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MAX_LOCAL_EXPORT_BYTES) {
    throw new LocalContractValidationError("本地备份不能超过 512 KB。");
  }
}

export function normalizeBoundedText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new LocalContractValidationError(`${label}必须是文本。`);
  }
  if (value.length > maxLength) {
    throw new LocalContractValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new LocalContractValidationError(`${label}不能为空。`);
  return normalized;
}

export function validateLocalEnvelope(value: unknown, expectedTool?: LocalTool): LocalExportEnvelope<unknown> {
  const envelope = requireRecord(value, "本地备份");
  if (envelope.format !== LOCAL_CONTRACT_FORMAT) {
    throw new LocalContractValidationError("这不是黑箱第三阶段本地工具备份。");
  }
  if (envelope.version !== LOCAL_CONTRACT_VERSION) {
    throw new LocalContractValidationError(`备份版本不兼容：仅支持版本 ${LOCAL_CONTRACT_VERSION}。`);
  }
  if (envelope.mode !== LOCAL_DEMO_MODE) {
    throw new LocalContractValidationError("仅支持同一浏览器本机演示模式备份。");
  }
  const tool = requireEnum(envelope.tool, ["team-match", "vote-wall", "checkin-claim"], "工具类型");
  if (expectedTool && tool !== expectedTool) {
    throw new LocalContractValidationError("备份不属于当前工具。");
  }
  requireIsoDate(envelope.exportedAt, "导出时间");

  const identities = requireArray(envelope.identities, "身份列表");
  if (identities.length > LOCAL_LIMITS.identities) {
    throw new LocalContractValidationError(`身份数量不能超过 ${LOCAL_LIMITS.identities} 个。`);
  }
  const parsedIdentities = identities.map((item, index) => validateIdentity(item, index));
  assertUniqueIds(parsedIdentities.map((item) => item.id), "身份");
  const identitiesById = new Map(parsedIdentities.map((item) => [item.id, item]));
  const identityIds = new Set(identitiesById.keys());

  const activities = requireArray(envelope.activities, "活动列表");
  if (activities.length > LOCAL_LIMITS.activities) {
    throw new LocalContractValidationError(`活动数量不能超过 ${LOCAL_LIMITS.activities} 个。`);
  }
  const parsedActivities = activities.map((item, index) => validateActivity(item, index, identityIds));
  assertUniqueIds(parsedActivities.map((item) => item.id), "活动");
  const activityIds = new Set(parsedActivities.map((item) => item.id));

  const participants = requireArray(envelope.participants, "参与者列表");
  if (participants.length > LOCAL_LIMITS.participants) {
    throw new LocalContractValidationError(`参与者数量不能超过 ${LOCAL_LIMITS.participants} 人。`);
  }
  const parsedParticipants = participants.map((item, index) =>
    validateParticipant(item, index, identityIds, activityIds),
  );
  assertUniqueIds(parsedParticipants.map((item) => item.id), "参与者");

  const activeIdentityId = envelope.activeIdentityId === null
    ? null
    : requireSafeId(envelope.activeIdentityId, "当前演示身份 ID");
  if (activeIdentityId !== null && (!identityIds.has(activeIdentityId)
    || identitiesById.get(activeIdentityId)?.status !== "active")) {
    throw new LocalContractValidationError("当前演示身份无效。");
  }
  if (envelope.data === null || typeof envelope.data !== "object" || Array.isArray(envelope.data)) {
    throw new LocalContractValidationError("工具数据必须是对象。");
  }

  return {
    format: LOCAL_CONTRACT_FORMAT,
    version: LOCAL_CONTRACT_VERSION,
    mode: LOCAL_DEMO_MODE,
    tool,
    exportedAt: requireIsoDate(envelope.exportedAt, "导出时间"),
    activeIdentityId,
    identities: parsedIdentities,
    activities: parsedActivities,
    participants: parsedParticipants,
    data: envelope.data,
  };
}

const ACTIVITY_TRANSITIONS: Readonly<Record<ActivityStatus, readonly ActivityStatus[]>> = {
  draft: ["open", "deleted"],
  open: ["paused", "closed", "deleted"],
  paused: ["open", "closed", "deleted"],
  closed: ["archived", "deleted"],
  archived: ["open", "deleted"],
  deleted: ["draft", "archived"],
};

const PARTICIPANT_TRANSITIONS: Readonly<Record<ActivityParticipantStatus, readonly ActivityParticipantStatus[]>> = {
  active: ["withdrawn", "deleted"],
  withdrawn: ["active", "deleted"],
  deleted: [],
};

function validateIdentity(value: unknown, index: number): LocalIdentity {
  const item = requireRecord(value, `第 ${index + 1} 个身份`);
  return {
    id: requireSafeId(item.id, "身份 ID"),
    displayName: normalizeBoundedText(item.displayName, "身份名称", LOCAL_LIMITS.identityName),
    status: requireEnum(item.status, ["active", "deleted"], "身份状态"),
    createdAt: requireIsoDate(item.createdAt, "身份创建时间"),
    updatedAt: requireIsoDate(item.updatedAt, "身份更新时间"),
    deletedAt: item.deletedAt === null ? null : requireIsoDate(item.deletedAt, "身份删除时间"),
  };
}

function validateActivity(
  value: unknown,
  index: number,
  identityIds: ReadonlySet<string>,
): LocalActivity {
  const item = requireRecord(value, `第 ${index + 1} 个活动`);
  const ownerIdentityId = requireSafeId(item.ownerIdentityId, "活动所有者 ID");
  if (!identityIds.has(ownerIdentityId)) throw new LocalContractValidationError("活动所有者身份不存在。");
  return {
    id: requireSafeId(item.id, "活动 ID"),
    tool: requireEnum(item.tool, ["team-match", "vote-wall", "checkin-claim"], "活动工具类型"),
    title: normalizeBoundedText(item.title, "活动标题", LOCAL_LIMITS.activityTitle),
    ownerIdentityId,
    status: requireEnum(item.status, ["draft", "open", "paused", "closed", "archived", "deleted"], "活动状态"),
    demoMode: requireEnum(item.demoMode, [LOCAL_DEMO_MODE], "演示模式"),
    createdAt: requireIsoDate(item.createdAt, "活动创建时间"),
    updatedAt: requireIsoDate(item.updatedAt, "活动更新时间"),
    deletedAt: item.deletedAt === null ? null : requireIsoDate(item.deletedAt, "活动删除时间"),
  };
}

function validateParticipant(
  value: unknown,
  index: number,
  identityIds: ReadonlySet<string>,
  activityIds: ReadonlySet<string>,
): ActivityParticipant {
  const item = requireRecord(value, `第 ${index + 1} 个参与者`);
  const identityId = requireSafeId(item.identityId, "参与者身份 ID");
  const activityId = requireSafeId(item.activityId, "参与者活动 ID");
  if (!identityIds.has(identityId)) throw new LocalContractValidationError("参与者身份不存在。");
  if (!activityIds.has(activityId)) throw new LocalContractValidationError("参与者所属活动不存在。");
  const profile = requireRecord(item.profile, "参与者资料");
  return {
    id: requireSafeId(item.id, "参与者 ID"),
    activityId,
    identityId,
    role: requireEnum(item.role, ["participant", "viewer"], "参与者角色"),
    status: requireEnum(item.status, ["active", "withdrawn", "deleted"], "参与者状态"),
    visibility: requireEnum(item.visibility, ["public", "limited", "private"], "资料可见性"),
    profile: {
      nickname: normalizeBoundedText(profile.nickname, "参与者昵称", LOCAL_LIMITS.identityName),
      skills: validateTags(profile.skills, "技能"),
      interests: validateTags(profile.interests, "兴趣"),
      bio: profile.bio === "" ? "" : normalizeBoundedText(profile.bio, "个人简介", LOCAL_LIMITS.profileBio),
    },
    joinedAt: requireIsoDate(item.joinedAt, "参与者加入时间"),
    updatedAt: requireIsoDate(item.updatedAt, "参与者更新时间"),
    withdrawnAt: item.withdrawnAt === null ? null : requireIsoDate(item.withdrawnAt, "参与者退出时间"),
    deletedAt: item.deletedAt === null ? null : requireIsoDate(item.deletedAt, "参与者删除时间"),
  };
}

function validateTags(value: unknown, label: string): string[] {
  const tags = requireArray(value, `${label}列表`);
  if (tags.length > LOCAL_LIMITS.profileTags) {
    throw new LocalContractValidationError(`${label}最多填写 ${LOCAL_LIMITS.profileTags} 项。`);
  }
  const normalized = tags.map((tag) => normalizeBoundedText(tag, label, LOCAL_LIMITS.profileTag));
  const keys = normalized.map((tag) => tag.toLocaleLowerCase("zh-CN"));
  if (new Set(keys).size !== keys.length) throw new LocalContractValidationError(`${label}不能重复。`);
  return normalized;
}

function assertUniqueIds(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new LocalContractValidationError(`${label} ID不能重复。`);
}

function requireSafeId(value: unknown, label: string): string {
  const id = requireString(value, label, LOCAL_LIMITS.id);
  if (!isSafeId(id)) throw new LocalContractValidationError(`${label}格式无效。`);
  return id;
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,120}$/.test(value);
}

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label, 40);
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new LocalContractValidationError(`${label}格式无效。`);
  }
  return text;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LocalContractValidationError(`${label}结构无效。`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new LocalContractValidationError(`${label}结构无效。`);
  return value;
}

function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new LocalContractValidationError(`${label}必须是文本。`);
  if (value.length > maxLength) throw new LocalContractValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  return value;
}

function requireEnum<const T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new LocalContractValidationError(`${label}无效。`);
  }
  return value as T;
}
