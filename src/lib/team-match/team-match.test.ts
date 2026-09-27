import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActivityParticipant, LocalActivity, LocalIdentity, LocalCommandMeta } from "@/lib/contracts/local-tools";
import { EMPTY_TEAM_MATCH_DATA, buildSuggestions, deleteParticipant, pairKey, respondToInvitation, sendInvitation, validateTeamMatchData, withdrawParticipant } from "./team-match";
import { makeEnvelope, parseSnapshotText } from "./storage";

const t = "2026-09-27T00:00:00.000Z";
const identity = (id: string, name = id): LocalIdentity => ({ id, displayName: name, status: "active", createdAt: t, updatedAt: t, deletedAt: null });
const activity: LocalActivity = { id: "activity-1", tool: "team-match", title: "匹配", ownerIdentityId: "host", status: "open", demoMode: "same-browser-demo", createdAt: t, updatedAt: t, deletedAt: null };
const person = (id: string, identityId: string, nickname: string, visibility: ActivityParticipant["visibility"] = "public", profile?: ActivityParticipant["profile"]): ActivityParticipant => ({ id, activityId: activity.id, identityId, role: "participant", status: "active", visibility, profile: profile ?? { nickname, skills: [], interests: [], bio: "" }, joinedAt: t, updatedAt: t, withdrawnAt: null, deletedAt: null });
const meta = (id: string, actor: string): LocalCommandMeta => ({ operationId: id, actorIdentityId: actor, issuedAt: t });

test("suggestions expose only visible, explicitly comparable evidence", () => {
  const host = person("p-a", "a", "甲", "public", { nickname: "甲", skills: ["前端"], interests: ["摄影"], bio: "可见" });
  const limited = person("p-b", "b", "乙", "limited", { nickname: "乙", skills: ["产品"], interests: ["摄影"], bio: "不应出现" });
  const privatePerson = person("p-c", "c", "丙", "private", { nickname: "丙", skills: ["后端"], interests: ["摄影"], bio: "秘密" });
  const result = buildSuggestions(activity.id, host, [host, limited, privatePerson], EMPTY_TEAM_MATCH_DATA);
  assert.equal(result.length, 1);
  assert.equal(result[0].bio, "");
  assert.match(result[0].evidence[0].text, /共同兴趣/);
  const blank = person("p-d", "d", "丁");
  const noFields = buildSuggestions(activity.id, host, [host, blank], EMPTY_TEAM_MATCH_DATA);
  assert.equal(noFields[0].evidence[0].text, "无可比较字段");
});

test("invitation state machine enforces sides, idempotency, and active-pair uniqueness", () => {
  const from = person("p-a", "a", "甲"); const to = person("p-b", "b", "乙"); const participants = [from, to];
  const first = sendInvitation(activity, "a", from, to, participants, EMPTY_TEAM_MATCH_DATA, meta("op-1", "a"));
  assert.equal(first.status, "created");
  const duplicate = sendInvitation(activity, "a", from, to, participants, first.data, meta("op-2", "a"));
  assert.equal(duplicate.status, "already-pending");
  assert.throws(() => respondToInvitation("accept", activity, "a", first.invitationId!, participants, first.data, meta("op-3", "a")), /接收方/);
  const accepted = respondToInvitation("accept", activity, "b", first.invitationId!, participants, first.data, meta("op-3", "b"));
  assert.equal(accepted.status, "accepted");
  const replay = respondToInvitation("accept", activity, "b", first.invitationId!, participants, accepted.data, meta("op-3", "b"));
  assert.equal(replay.status, "accepted");
  assert.throws(() => respondToInvitation("reject", activity, "b", first.invitationId!, participants, accepted.data, meta("op-conflict", "b")), /邀请当前状态/);
  assert.throws(() => respondToInvitation("withdraw", activity, "b", first.invitationId!, participants, first.data, meta("op-4", "b")), /发送方/);
  assert.equal(pairKey("p-b", "p-a"), "p-a::p-b");
});

test("withdraw and delete cancel pending, end matches, and preserve an audit placeholder", () => {
  const from = person("p-a", "a", "甲"); const to = person("p-b", "b", "乙");
  const sent = sendInvitation(activity, "a", from, to, [from, to], EMPTY_TEAM_MATCH_DATA, meta("op-1", "a"));
  const withdrawn = withdrawParticipant(activity, "a", from, sent.data);
  assert.equal(withdrawn.invitations[0].status, "withdrawn");
  assert.equal(withdrawn.audits[0].action, "participant-withdrawn");
  const accepted = respondToInvitation("accept", activity, "b", sent.invitationId!, [from, to], sent.data, meta("op-2", "b"));
  const deleted = deleteParticipant(activity, "a", from, accepted.data);
  assert.equal(deleted.matches[0].status, "ended");
  assert.equal(deleted.audits.at(-1)?.action, "participant-deleted");
});

test("private data remains local to the owner and invalid imports fail before restore", () => {
  const ids = [identity("host"), identity("a")];
  const participants = [person("p-a", "a", "甲", "private")];
  const snapshot = { activeIdentityId: "host", identities: ids, activities: [activity], participants, data: EMPTY_TEAM_MATCH_DATA };
  assert.doesNotThrow(() => parseSnapshotText(JSON.stringify(makeEnvelope(snapshot))));
  const malformed = makeEnvelope(snapshot);
  malformed.tool = "vote-wall";
  assert.throws(() => parseSnapshotText(JSON.stringify(malformed)), /不属于当前工具/);
  assert.throws(() => validateTeamMatchData({ invitations: [], matches: [], exclusions: [], operations: [] }), /字段不完整/);
  const dangling = makeEnvelope({ ...snapshot, data: { ...EMPTY_TEAM_MATCH_DATA, invitations: [{ id: "i", activityId: activity.id, fromParticipantId: "missing", toParticipantId: "p-a", status: "pending", createdAt: t, updatedAt: t, expiresAt: null, respondedAt: null }] } });
  assert.throws(() => parseSnapshotText(JSON.stringify(dangling)), /悬空邀请/);
});
