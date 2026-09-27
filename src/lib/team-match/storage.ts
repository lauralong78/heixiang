import {
  MAX_LOCAL_EXPORT_BYTES,
  LOCAL_CONTRACT_FORMAT,
  LOCAL_CONTRACT_VERSION,
  LOCAL_DEMO_MODE,
  assertImportSize,
  validateLocalEnvelope,
  type ActivityParticipant,
  type LocalActivity,
  type LocalExportEnvelope,
  type LocalIdentity,
} from "@/lib/contracts/local-tools";
import { EMPTY_TEAM_MATCH_DATA, validateTeamMatchData, type TeamMatchData } from "./team-match";

export type TeamMatchSnapshot = {
  activeIdentityId: string | null;
  identities: LocalIdentity[];
  activities: LocalActivity[];
  participants: ActivityParticipant[];
  data: TeamMatchData;
};

export const EMPTY_TEAM_MATCH_SNAPSHOT: TeamMatchSnapshot = {
  activeIdentityId: null, identities: [], activities: [], participants: [], data: EMPTY_TEAM_MATCH_DATA,
};

export function makeEnvelope(snapshot: TeamMatchSnapshot, exportedAt = new Date().toISOString()): LocalExportEnvelope<TeamMatchData> {
  return { format: LOCAL_CONTRACT_FORMAT, version: LOCAL_CONTRACT_VERSION, mode: LOCAL_DEMO_MODE, tool: "team-match", exportedAt, activeIdentityId: snapshot.activeIdentityId, identities: snapshot.identities, activities: snapshot.activities, participants: snapshot.participants, data: snapshot.data };
}

export function serializeSnapshot(snapshot: TeamMatchSnapshot) { return JSON.stringify(makeEnvelope(snapshot), null, 2); }

export function parseSnapshotText(text: string): TeamMatchSnapshot {
  const bytes = new TextEncoder().encode(text).byteLength;
  assertImportSize(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("JSON 文件损坏，无法恢复。"); }
  const envelope = validateLocalEnvelope(parsed, "team-match");
  const data = validateTeamMatchData(envelope.data);
  const activityIds = new Set(envelope.activities.map((item) => item.id));
  const participantIds = new Set(envelope.participants.map((item) => item.id));
  for (const participant of envelope.participants) if (!activityIds.has(participant.activityId)) throw new Error("备份包含悬空参与者引用。");
  for (const invitation of data.invitations) {
    if (!activityIds.has(invitation.activityId) || !participantIds.has(invitation.fromParticipantId) || !participantIds.has(invitation.toParticipantId)) throw new Error("备份包含悬空邀请引用。");
  }
  for (const match of data.matches) {
    if (!activityIds.has(match.activityId) || match.participantIds.some((id) => !participantIds.has(id))) throw new Error("备份包含悬空匹配引用。");
  }
  for (const exclusion of data.exclusions) {
    if (!activityIds.has(exclusion.activityId) || exclusion.participantIds.some((id) => !participantIds.has(id))) throw new Error("备份包含悬空排除关系。");
  }
  return { activeIdentityId: envelope.activeIdentityId, identities: envelope.identities, activities: envelope.activities, participants: envelope.participants, data };
}

export function readStoredSnapshot(raw: string | null): { snapshot: TeamMatchSnapshot; warning: string } {
  if (!raw) return { snapshot: EMPTY_TEAM_MATCH_SNAPSHOT, warning: "" };
  try { return { snapshot: parseSnapshotText(raw), warning: "" }; }
  catch { return { snapshot: EMPTY_TEAM_MATCH_SNAPSHOT, warning: "本地队友匹配数据无效，已使用空白状态；原数据没有上传。" }; }
}

export function assertExportSize(text: string) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_LOCAL_EXPORT_BYTES) throw new Error("导出数据超过 512 KB。");
}
