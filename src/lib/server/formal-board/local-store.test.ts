import assert from "node:assert/strict";
import { test } from "node:test";

import { FormalBoardStorageConfigurationError, getFormalBoardStorageMode } from "./storage";
import { localCreateActivity, localCreatePoll, localCreateOption, localCastVote, localSnapshot, localUpdatePoll, localRegister, localCreateInvite, localJoinInvite, localListTeams, localRevokeInvite, localUpdateActivity } from "./local-store";
import { createInviteToken } from "./invite-service";

test("formal board defaults to local mode without Supabase configuration", () => {
  assert.equal(getFormalBoardStorageMode({}), "local");
  assert.equal(getFormalBoardStorageMode({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "not-used-in-test" }), "local");
  assert.equal(getFormalBoardStorageMode({ FORMAL_BOARD_STORAGE_MODE: "supabase", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "not-used-in-test" }), "supabase");
  assert.throws(() => getFormalBoardStorageMode({ FORMAL_BOARD_STORAGE_MODE: "supabase" }), (error: unknown) => error instanceof FormalBoardStorageConfigurationError && error.message.includes("缺少 SUPABASE_URL"));
});

test("local mode keeps vote uniqueness and server-side activity ownership", async () => {
  const userId = `local-test-${Date.now()}`;
  const registered = await localRegister(userId, "local-test-password");
  const ownerId = registered.id;
  const activity = localCreateActivity({ userId: ownerId, title: "local test", description: "", requestId: "local-test-create" });
  localUpdateActivity({ userId: ownerId, activityId: activity.id, title: activity.title, description: activity.description, status: "open", expectedVersion: 1, requestId: "local-test-open-activity" });
  const poll = localCreatePoll({ userId: ownerId, activityId: activity.id, title: "choice", description: "", hostEligible: true, allowSelfVote: true, resultMode: "live", requestId: "local-test-poll" });
  const option = localCreateOption({ userId: ownerId, pollId: poll.id, title: "one", description: "", link: null, submittedBy: null, requestId: "local-test-option" });
  localCreatePoll({ userId: ownerId, activityId: activity.id, title: "unused", description: "", hostEligible: true, allowSelfVote: true, resultMode: "live", requestId: "local-test-poll-2" });
  const opened = localUpdatePoll({ userId: ownerId, pollId: poll.id, open: true, close: false, expectedVersion: 1, requestId: "local-test-open" });
  assert.equal(opened.status, "open");
  assert.equal(localCastVote({ userId: ownerId, pollId: poll.id, optionId: option.id, requestId: "local-test-vote" }).code, "RECORDED");
  assert.equal(localCastVote({ userId: ownerId, pollId: poll.id, optionId: option.id, requestId: "local-test-vote-repeat" }).code, "ALREADY_VOTED");
  const snapshot = localSnapshot(ownerId, poll.id);
  assert.equal(snapshot.viewerVote?.optionId, option.id);
  assert.equal(snapshot.results[0]?.count, 1, "live mode exposes counts through both snapshot and result semantics");
});

test("local scoped invites preserve team semantics and enforce reuse limits", async () => {
  const suffix = Date.now().toString();
  const host = await localRegister(`invite-host-${suffix}`, "local-test-password");
  const captain = await localRegister(`invite-captain-${suffix}`, "local-test-password");
  const member = await localRegister(`invite-member-${suffix}`, "local-test-password");
  const secondMember = await localRegister(`invite-member2-${suffix}`, "local-test-password");
  const activity = localCreateActivity({ userId: host.id, title: "invite test", description: "", requestId: `invite-activity-${suffix}` });
  const captainToken = createInviteToken();
  const captainInvite = localCreateInvite({ userId: host.id, activityId: activity.id, inviteType: "activity_team", teamName: "Alpha", expiresAt: null, maxUses: 1, tokenDigest: captainToken.digest, tokenHint: captainToken.hint, requestId: `invite-create-${suffix}` });
  const captainJoin = localJoinInvite({ userId: captain.id, tokenDigest: captainToken.digest, requestId: `invite-join-${suffix}` })[0];
  assert.equal(captainJoin.invite_type, "activity_team");
  assert.ok(captainJoin.team_id);
  assert.equal(localListTeams(captain.id, activity.id).find((team) => team.id === captainJoin.team_id)?.team_role, "captain");
  assert.equal(localJoinInvite({ userId: captain.id, tokenDigest: captainToken.digest, requestId: `invite-repeat-${suffix}` })[0].already_joined, true);
  assert.equal(captainInvite.team_name, "Alpha");

  const memberToken = createInviteToken();
  const memberInvite = localCreateInvite({ userId: captain.id, activityId: activity.id, inviteType: "team_member", teamId: captainJoin.team_id, expiresAt: null, maxUses: 1, tokenDigest: memberToken.digest, tokenHint: memberToken.hint, requestId: `member-invite-${suffix}` });
  const memberJoin = localJoinInvite({ userId: member.id, tokenDigest: memberToken.digest, requestId: `member-join-${suffix}` })[0];
  assert.equal(memberJoin.team_id, captainJoin.team_id);
  assert.equal(localListTeams(member.id, activity.id).find((team) => team.id === captainJoin.team_id)?.team_role, "member");
  assert.throws(() => localJoinInvite({ userId: secondMember.id, tokenDigest: memberToken.digest, requestId: `member-over-limit-${suffix}` }), /邀请无效/);

  const revokedToken = createInviteToken();
  const revoked = localCreateInvite({ userId: host.id, activityId: activity.id, inviteType: "activity_team", teamName: "Revoked", expiresAt: null, maxUses: 1, tokenDigest: revokedToken.digest, tokenHint: revokedToken.hint, requestId: `revoke-create-${suffix}` });
  localRevokeInvite({ userId: host.id, inviteId: revoked.id, requestId: `revoke-${suffix}` });
  assert.throws(() => localJoinInvite({ userId: secondMember.id, tokenDigest: revokedToken.digest, requestId: `revoke-join-${suffix}` }), /邀请无效/);

  const expiredToken = createInviteToken();
  localCreateInvite({ userId: host.id, activityId: activity.id, inviteType: "activity_team", teamName: "Expired", expiresAt: new Date(Date.now() - 1000).toISOString(), maxUses: 1, tokenDigest: expiredToken.digest, tokenHint: expiredToken.hint, requestId: `expire-create-${suffix}` });
  assert.throws(() => localJoinInvite({ userId: secondMember.id, tokenDigest: expiredToken.digest, requestId: `expire-join-${suffix}` }), /邀请无效/);
  assert.equal(memberInvite.team_id, captainJoin.team_id);
});
