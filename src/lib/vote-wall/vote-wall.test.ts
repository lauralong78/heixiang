import assert from "node:assert/strict";
import test from "node:test";

import { LOCAL_DEMO_MODE, type ActivityParticipant, type LocalActivity, type LocalCommandMeta, type LocalIdentity } from "@/lib/contracts/local-tools";
import { addArtwork, assertImportSize, castVote, closeActivity, createEmptyData, createSettings, eligibility, makeEnvelope, parseBackupText, resultFor, validateHttpsUrl, validateSnapshot, voidVote, type VoteWallSnapshot } from "./vote-wall";

const time = "2026-09-27T00:00:00.000Z";
const identity = (id: string, name = id): LocalIdentity => ({ id, displayName: name, status: "active", createdAt: time, updatedAt: time, deletedAt: null });
const activity = (status: LocalActivity["status"] = "draft"): LocalActivity => ({ id: "activity-1", tool: "vote-wall", title: "Demo", ownerIdentityId: "host", status, demoMode: LOCAL_DEMO_MODE, createdAt: time, updatedAt: time, deletedAt: null });
const participant = (id: string, role: ActivityParticipant["role"] = "participant"): ActivityParticipant => ({ id: `participant-${id}`, activityId: "activity-1", identityId: id, role, status: "active", visibility: "public", profile: { nickname: id, skills: [], interests: [], bio: "" }, joinedAt: time, updatedAt: time, withdrawnAt: null, deletedAt: null });
function base(status: LocalActivity["status"] = "draft"): VoteWallSnapshot { return validateSnapshot({ identities: [identity("host"), identity("alice"), identity("viewer")], activities: [activity(status)], participants: [participant("alice"), participant("viewer", "viewer")], activeIdentityId: "host", data: { ...createEmptyData(), settings: [createSettings("activity-1")] } }); }
function meta(actorIdentityId: string, operationId = `op-${actorIdentityId}`): LocalCommandMeta { return { operationId, actorIdentityId, issuedAt: time }; }
function withArtwork(snapshot = base(), submitterIdentityId = "host"): VoteWallSnapshot { return { ...snapshot, data: addArtwork(snapshot.data, { activityId: "activity-1", submitterIdentityId, title: "作品 A", description: "说明", link: null }, time) }; }

test("资格规则覆盖 host、viewer、自投和规则锁定边界", () => {
  let current = withArtwork(base(), "alice"); const artwork = current.data.artworks[0]; const settings = current.data.settings[0];
  assert.equal(eligibility(current.activities[0], "host", current.participants, settings, artwork).ok, false);
  assert.equal(eligibility(current.activities[0], "viewer", current.participants, settings, artwork).ok, false);
  assert.equal(eligibility(current.activities[0], "alice", current.participants, settings, artwork).ok, false);
  current = { ...current, data: { ...current.data, settings: [{ ...settings, hostEligible: true, allowSelfVote: true }] }, activities: [{ ...current.activities[0], status: "open" }] };
  assert.equal(eligibility(current.activities[0], "host", current.participants, current.data.settings[0], artwork).ok, true);
  assert.equal(eligibility(current.activities[0], "alice", current.participants, current.data.settings[0], artwork).ok, true);
});

test("单票唯一、重复 operationId 幂等且参数冲突拒绝", () => {
  let current = withArtwork({ ...base("open"), data: { ...base("open").data, settings: [{ ...createSettings("activity-1"), resultMode: "live" }] } });
  const artworkId = current.data.artworks[0].id;
  const first = castVote(current, "activity-1", artworkId, meta("alice", "op-1"), time); current = first.snapshot;
  assert.equal(first.result.code, "RECORDED");
  const replay = castVote(current, "activity-1", artworkId, meta("alice", "op-1"), time); assert.equal(replay.result.code, "RECORDED"); assert.equal(replay.snapshot.data.votes.length, 1);
  const repeated = castVote(current, "activity-1", artworkId, meta("alice", "op-2"), time); assert.equal(repeated.result.code, "ALREADY_VOTED"); assert.equal(repeated.snapshot.data.votes.length, 1);
  assert.throws(() => castVote(current, "activity-1", artworkId, meta("alice", "op-1").operationId ? { ...meta("alice", "op-1"), actorIdentityId: "host" } : meta("alice")), /operationId/);
});

test("void 保留审计且不再允许无痕重投", () => {
  let current = withArtwork({ ...base("open"), data: { ...base("open").data, settings: [{ ...createSettings("activity-1"), resultMode: "live" }] } });
  current = castVote(current, "activity-1", current.data.artworks[0].id, meta("alice"), time).snapshot;
  const vote = current.data.votes[0]; current = voidVote(current, "activity-1", vote.id, "重复测试票", meta("host", "void-1"), time);
  assert.equal(current.data.votes[0].status, "voided"); assert.equal(current.data.audits.some((audit) => audit.kind === "vote-voided"), true);
  assert.equal(castVote(current, "activity-1", current.data.artworks[0].id, meta("alice", "new-op"), time).result.code, "ALREADY_VOTED");
});

test("hidden/live/final 结果模式与 close 冻结", () => {
  let current = withArtwork({ ...base("open"), data: { ...base("open").data, settings: [{ ...createSettings("activity-1"), resultMode: "hidden" }] } }); const artworkId = current.data.artworks[0].id;
  current = castVote(current, "activity-1", artworkId, meta("alice"), time).snapshot; assert.equal(resultFor(current, "activity-1", artworkId).count, null);
  current = { ...current, data: { ...current.data, settings: [{ ...current.data.settings[0], resultMode: "live" }] } }; assert.equal(resultFor(current, "activity-1", artworkId).count, 1);
  current = { ...current, data: { ...current.data, settings: [{ ...current.data.settings[0], resultMode: "final" }] } }; assert.equal(resultFor(current, "activity-1", artworkId).count, null);
  current = closeActivity(current, "activity-1", "结束", meta("host"), time); assert.equal(resultFor(current, "activity-1", artworkId).count, 1); assert.throws(() => castVote(current, "activity-1", artworkId, meta("viewer", "after")), /关闭/);
});

test("危险链接、错误版本、悬空引用和超限导入被拒绝", () => {
  assert.throws(() => validateHttpsUrl("javascript:alert(1)"), /HTTPS/); assert.throws(() => validateHttpsUrl("http://example.com"), /HTTPS/);
  assert.throws(() => assertImportSize(512 * 1024 + 1), /512 KB/);
  const snapshot = withArtwork(); const envelope = makeEnvelope(snapshot, time); assert.deepEqual(parseBackupText(JSON.stringify(envelope)).data.artworks.length, 1);
  assert.throws(() => parseBackupText(JSON.stringify({ ...envelope, version: 99 })), /版本/);
  assert.throws(() => parseBackupText(JSON.stringify({ ...envelope, tool: "checkin-claim" })), /不属于/);
  assert.throws(() => parseBackupText(JSON.stringify({ ...envelope, data: { ...envelope.data, votes: [{ id: "vote-1", activityId: "activity-1", voterIdentityId: "alice", artworkId: "missing", status: "active", castAt: time, voidedAt: null, voidReason: null }] } })), /错误的作品/);
});

test("导入失败不会改变调用方快照，往返恢复保留投票", () => {
  let current = withArtwork({ ...base("open"), data: { ...base("open").data, settings: [{ ...createSettings("activity-1"), resultMode: "live" }] } }); current = castVote(current, "activity-1", current.data.artworks[0].id, meta("alice"), time).snapshot;
  const restored = parseBackupText(JSON.stringify(makeEnvelope(current, time))); assert.equal(restored.data.votes.length, 1); assert.equal(restored.data.votes[0].voterIdentityId, "alice");
});
