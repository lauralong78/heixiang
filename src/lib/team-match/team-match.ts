import {
  LOCAL_LIMITS,
  canActOnOwnParticipant,
  type ActivityParticipant,
  type LocalActivity,
  type LocalCommandMeta,
} from "@/lib/contracts/local-tools";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired";
export type MatchStatus = "active" | "ended";
export type EndReason = "participant-withdrew" | "participant-deleted";

export type TeamMatchInvitation = {
  id: string;
  activityId: string;
  fromParticipantId: string;
  toParticipantId: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  respondedAt: string | null;
};

export type TeamMatchRecord = {
  id: string;
  activityId: string;
  participantIds: [string, string];
  status: MatchStatus;
  createdAt: string;
  endedAt: string | null;
  endReason: EndReason | null;
  invitationId: string;
};

export type PairExclusion = { activityId: string; participantIds: [string, string]; createdAt: string };
export type TeamMatchOperation = {
  operationId: string;
  fingerprint: string;
  result: string;
  invitationId?: string;
  createdAt: string;
};
export type TeamMatchAudit = {
  id: string;
  action: "participant-withdrawn" | "participant-deleted" | "invitation-expired";
  activityId: string;
  participantId?: string;
  at: string;
};

export type TeamMatchData = {
  invitations: TeamMatchInvitation[];
  matches: TeamMatchRecord[];
  exclusions: PairExclusion[];
  operations: TeamMatchOperation[];
  audits: TeamMatchAudit[];
};

export type MatchEvidence = { kind: "interest" | "skill" | "history"; text: string };
export type MatchSuggestion = {
  participantId: string;
  nickname: string;
  visibility: "public" | "limited";
  skills: string[];
  interests: string[];
  bio: string;
  historyCount: number;
  evidence: MatchEvidence[];
  score: number;
};

export const TEAM_MATCH_STORAGE_KEY = "hackkit.team-match.v1";
export const EMPTY_TEAM_MATCH_DATA: TeamMatchData = {
  invitations: [], matches: [], exclusions: [], operations: [], audits: [],
};

export function pairKey(first: string, second: string) { return [first, second].sort().join("::"); }

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function splitTags(value: string) {
  return [...new Set(value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, LOCAL_LIMITS.profileTags);
}

function common(first: string[], second: string[]) {
  const secondKeys = new Set(second.map((item) => item.toLocaleLowerCase("zh-CN")));
  return first.filter((item) => secondKeys.has(item.toLocaleLowerCase("zh-CN")));
}

function difference(first: string[], second: string[]) {
  const secondKeys = new Set(second.map((item) => item.toLocaleLowerCase("zh-CN")));
  return first.filter((item) => !secondKeys.has(item.toLocaleLowerCase("zh-CN")));
}

function activeParticipant(activityId: string, item: ActivityParticipant) {
  return item.activityId === activityId && item.status === "active" && item.role === "participant";
}

export function getVisibleProfile(profile: ActivityParticipant, viewerIdentityId: string) {
  const own = profile.identityId === viewerIdentityId;
  if (own || profile.visibility === "public") return { ...profile.profile };
  if (profile.visibility === "limited") return { ...profile.profile, bio: "" };
  return null;
}

export function buildSuggestions(
  activityId: string,
  actor: ActivityParticipant,
  participants: readonly ActivityParticipant[],
  data: TeamMatchData,
): MatchSuggestion[] {
  if (!activeParticipant(activityId, actor)) return [];
  return participants
    .filter((candidate) => activeParticipant(activityId, candidate)
      && candidate.id !== actor.id
      && candidate.visibility !== "private"
      && !data.exclusions.some((item) => item.activityId === activityId && pairKey(...item.participantIds) === pairKey(actor.id, candidate.id)))
    .map((candidate) => {
      const first = actor.profile;
      const second = candidate.profile;
      const interests = common(first.interests, second.interests);
      const actorSkills = difference(first.skills, second.skills);
      const candidateSkills = difference(second.skills, first.skills);
      const historyCount = data.matches.filter((match) => match.activityId === activityId
        && pairKey(...match.participantIds) === pairKey(actor.id, candidate.id)).length;
      const evidence: MatchEvidence[] = [];
      if (interests.length) evidence.push({ kind: "interest", text: `共同兴趣：${interests.join("、")}` });
      if (actorSkills.length && candidateSkills.length) {
        evidence.push({ kind: "skill", text: `互补技能：${actor.profile.nickname} 的${actorSkills.join("、")} ↔ ${candidate.profile.nickname} 的${candidateSkills.join("、")}` });
      }
      if (historyCount) evidence.push({ kind: "history", text: `历史相遇：${historyCount} 次` });
      if (!evidence.length) evidence.push({ kind: "history", text: "无可比较字段" });
      return {
        participantId: candidate.id,
        nickname: candidate.profile.nickname,
        visibility: candidate.visibility as "public" | "limited",
        skills: candidate.profile.skills,
        interests: candidate.profile.interests,
        bio: candidate.visibility === "public" ? candidate.profile.bio : "",
        historyCount,
        evidence,
        score: interests.length * 4 + Math.min(actorSkills.length, 2) + Math.min(candidateSkills.length, 2) - historyCount,
      };
    })
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "zh-CN"));
}

function fingerprint(meta: LocalCommandMeta, action: string, invitationId?: string) {
  return JSON.stringify({ action, invitationId: invitationId ?? null, actor: meta.actorIdentityId });
}

function checkOperation(data: TeamMatchData, meta: LocalCommandMeta, action: string, invitationId?: string) {
  const value = fingerprint(meta, action, invitationId);
  const prior = data.operations.find((item) => item.operationId === meta.operationId);
  if (prior && prior.fingerprint !== value) throw new Error("operationId 已被其他参数使用，已拒绝冲突操作。");
  return { value, prior };
}

function findParticipant(participants: readonly ActivityParticipant[], id: string, activityId: string) {
  const item = participants.find((entry) => entry.id === id && entry.activityId === activityId);
  if (!item) throw new Error("参与者不存在或不属于当前活动。");
  return item;
}

function assertOpen(activity: LocalActivity) {
  if (activity.status !== "open") throw new Error("活动未开放，不能写入新的邀请。");
}

export function sendInvitation(
  activity: LocalActivity,
  actorIdentityId: string,
  from: ActivityParticipant,
  to: ActivityParticipant,
  participants: readonly ActivityParticipant[],
  data: TeamMatchData,
  meta: LocalCommandMeta,
  now = new Date().toISOString(),
) {
  assertOpen(activity);
  const op = checkOperation(data, meta, "send", `${from.id}:${to.id}`);
  if (op.prior) return { data, status: op.prior.result, invitationId: op.prior.invitationId };
  if (!canActOnOwnParticipant("submit-self", actorIdentityId, from)) throw new Error("只有发送方本人可以发出邀请。");
  findParticipant(participants, to.id, activity.id);
  if (from.id === to.id || to.status !== "active") throw new Error("接收方必须是另一名活跃参与者。");
  const existing = data.invitations.find((item) => item.activityId === activity.id
    && item.status === "pending" && pairKey(item.fromParticipantId, item.toParticipantId) === pairKey(from.id, to.id));
  if (existing) return { data, status: "already-pending", invitationId: existing.id };
  const invitation: TeamMatchInvitation = {
    id: createId("invite"), activityId: activity.id, fromParticipantId: from.id, toParticipantId: to.id,
    status: "pending", createdAt: now, updatedAt: now, expiresAt: null, respondedAt: null,
  };
  return {
    data: { ...data, invitations: [...data.invitations, invitation], operations: [...data.operations, { operationId: meta.operationId, fingerprint: op.value, result: "created", invitationId: invitation.id, createdAt: now }] },
    status: "created", invitationId: invitation.id,
  };
}

export function respondToInvitation(
  action: "accept" | "reject" | "withdraw",
  activity: LocalActivity,
  actorIdentityId: string,
  invitationId: string,
  participants: readonly ActivityParticipant[],
  data: TeamMatchData,
  meta: LocalCommandMeta,
  now = new Date().toISOString(),
) {
  const op = checkOperation(data, meta, action, invitationId);
  if (op.prior) return { data, status: op.prior.result, invitationId };
  assertOpen(activity);
  const invitation = data.invitations.find((item) => item.id === invitationId && item.activityId === activity.id);
  if (!invitation) throw new Error("邀请不存在。");
  const from = findParticipant(participants, invitation.fromParticipantId, activity.id);
  const to = findParticipant(participants, invitation.toParticipantId, activity.id);
  if (invitation.status !== "pending") throw new Error(`邀请当前状态为 ${invitation.status}，不能重复处理。`);
  if (from.status !== "active" || to.status !== "active") throw new Error("参与者已退出或删除，邀请不能继续处理。");
  const isSender = from.identityId === actorIdentityId;
  const isReceiver = to.identityId === actorIdentityId;
  if (action === "withdraw" && !isSender) throw new Error("只有发送方本人可以撤回邀请。");
  if ((action === "accept" || action === "reject") && !isReceiver) throw new Error("只有接收方本人可以接受或拒绝邀请。");
  const status: InvitationStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "withdrawn";
  const updatedInvitation = { ...invitation, status, updatedAt: now, respondedAt: now };
  const updatedData = { ...data, invitations: data.invitations.map((item) => item.id === invitation.id ? updatedInvitation : item) };
  const match = action === "accept" ? { id: createId("match"), activityId: activity.id, participantIds: [from.id, to.id] as [string, string], status: "active" as const, createdAt: now, endedAt: null, endReason: null, invitationId: invitation.id } : null;
  return {
    data: { ...updatedData, matches: match ? [...data.matches, match] : data.matches, operations: [...data.operations, { operationId: meta.operationId, fingerprint: op.value, result: status, invitationId, createdAt: now }] },
    status,
    invitationId,
  };
}

export function expirePending(activity: LocalActivity, data: TeamMatchData, now = new Date().toISOString()) {
  if (activity.status === "open") return data;
  const pending = data.invitations.filter((item) => item.activityId === activity.id && item.status === "pending");
  if (!pending.length) return data;
  return { ...data, invitations: data.invitations.map((item) => pending.some((entry) => entry.id === item.id) ? { ...item, status: "expired" as const, updatedAt: now, respondedAt: now } : item), audits: [...data.audits, ...pending.map(() => ({ id: createId("audit"), action: "invitation-expired" as const, activityId: activity.id, at: now }))] };
}

export function withdrawParticipant(activity: LocalActivity, actorIdentityId: string, participant: ActivityParticipant, data: TeamMatchData, now = new Date().toISOString()) {
  if (!canActOnOwnParticipant("withdraw-self", actorIdentityId, participant)) throw new Error("只有本人可以退出自己的参与记录。");
  const invitations = data.invitations.map((item) => item.activityId === activity.id && item.status === "pending" && (item.fromParticipantId === participant.id || item.toParticipantId === participant.id) ? { ...item, status: "withdrawn" as const, updatedAt: now, respondedAt: now } : item);
  const matches = data.matches.map((item) => item.activityId === activity.id && item.status === "active" && item.participantIds.includes(participant.id) ? { ...item, status: "ended" as const, endedAt: now, endReason: "participant-withdrew" as const } : item);
  return { invitations, matches, exclusions: data.exclusions, operations: data.operations, audits: [...data.audits, { id: createId("audit"), action: "participant-withdrawn" as const, activityId: activity.id, participantId: participant.id, at: now }] };
}

export function deleteParticipant(activity: LocalActivity, actorIdentityId: string, participant: ActivityParticipant, data: TeamMatchData, now = new Date().toISOString()) {
  if (!canActOnOwnParticipant("delete-self", actorIdentityId, participant)) throw new Error("只有本人可以删除自己的资料。");
  const next = withdrawParticipant(activity, actorIdentityId, participant, data, now);
  return { ...next, audits: [...next.audits, { id: createId("audit"), action: "participant-deleted" as const, activityId: activity.id, participantId: participant.id, at: now }] };
}

export function anonymizeParticipant(participant: ActivityParticipant, now = new Date().toISOString()): ActivityParticipant {
  return { ...participant, status: "deleted", visibility: "private", profile: { nickname: "已删除参与者", skills: [], interests: [], bio: "" }, updatedAt: now, deletedAt: now };
}

export function validateTeamMatchData(value: unknown): TeamMatchData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("队友匹配数据必须是对象。");
  const data = value as Partial<TeamMatchData>;
  if (!Array.isArray(data.invitations) || !Array.isArray(data.matches) || !Array.isArray(data.exclusions) || !Array.isArray(data.operations) || !Array.isArray(data.audits)) throw new Error("队友匹配数据字段不完整。");
  const statuses: InvitationStatus[] = ["pending", "accepted", "rejected", "withdrawn", "expired"];
  for (const item of data.invitations) {
    if (!item || typeof item !== "object" || !safeId(item.id) || !safeId(item.activityId) || !safeId(item.fromParticipantId) || !safeId(item.toParticipantId) || !statuses.includes(item.status as InvitationStatus) || !iso(item.createdAt) || !iso(item.updatedAt) || (item.expiresAt !== null && !iso(item.expiresAt)) || (item.respondedAt !== null && !iso(item.respondedAt))) throw new Error("邀请记录无效。");
  }
  for (const item of data.matches) {
    if (!item || typeof item !== "object" || !safeId(item.id) || !safeId(item.activityId) || !Array.isArray(item.participantIds) || item.participantIds.length !== 2 || !item.participantIds.every(safeId) || !["active", "ended"].includes(item.status) || !safeId(item.invitationId) || !iso(item.createdAt) || (item.endedAt !== null && !iso(item.endedAt)) || (item.endReason !== null && !["participant-withdrew", "participant-deleted"].includes(item.endReason))) throw new Error("匹配记录无效。");
  }
  for (const item of data.exclusions) {
    if (!item || typeof item !== "object" || !safeId(item.activityId) || !Array.isArray(item.participantIds) || item.participantIds.length !== 2 || !item.participantIds.every(safeId) || !iso(item.createdAt)) throw new Error("排除关系无效。");
  }
  for (const item of data.operations) {
    if (!item || typeof item !== "object" || !safeId(item.operationId) || typeof item.fingerprint !== "string" || item.fingerprint.length > 500 || typeof item.result !== "string" || item.result.length > 80 || (item.invitationId !== undefined && !safeId(item.invitationId)) || !iso(item.createdAt)) throw new Error("操作记录无效。");
  }
  for (const item of data.audits) {
    if (!item || typeof item !== "object" || !safeId(item.id) || !["participant-withdrawn", "participant-deleted", "invitation-expired"].includes(item.action) || !safeId(item.activityId) || (item.participantId !== undefined && !safeId(item.participantId)) || !iso(item.at)) throw new Error("审计记录无效。");
  }
  if (new Set(data.invitations.map((item) => item.id)).size !== data.invitations.length || new Set(data.matches.map((item) => item.id)).size !== data.matches.length) throw new Error("邀请或匹配 ID 重复。");
  if (data.invitations.length > 2000 || data.matches.length > 2000 || data.operations.length > 5000) throw new Error("队友匹配记录数量超出限制。");
  return data as TeamMatchData;
}

function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value); }
function iso(value: unknown): value is string { return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
