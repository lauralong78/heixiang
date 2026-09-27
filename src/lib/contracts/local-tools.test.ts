import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LOCAL_CONTRACT_FORMAT,
  LOCAL_CONTRACT_VERSION,
  LOCAL_DEMO_MODE,
  assertImportSize,
  canActOnOwnParticipant,
  canPerform,
  canTransitionActivity,
  canTransitionParticipant,
  resolveActivityRole,
  validateLocalEnvelope,
  type ActivityParticipant,
  type LocalActivity,
  type LocalExportEnvelope,
  type LocalIdentity,
} from "./local-tools";

const timestamp = "2026-09-27T00:00:00.000Z";

const identity: LocalIdentity = {
  id: "identity-host",
  displayName: "主持人",
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
};

const participantIdentity: LocalIdentity = {
  ...identity,
  id: "identity-participant",
  displayName: "参与者",
};

const activity: LocalActivity = {
  id: "activity-1",
  tool: "team-match",
  title: "本地演示活动",
  ownerIdentityId: identity.id,
  status: "open",
  demoMode: LOCAL_DEMO_MODE,
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
};

const participant: ActivityParticipant = {
  id: "participant-1",
  activityId: activity.id,
  identityId: participantIdentity.id,
  role: "participant",
  status: "active",
  visibility: "limited",
  profile: { nickname: "参与者", skills: ["前端"], interests: ["教育"], bio: "" },
  joinedAt: timestamp,
  updatedAt: timestamp,
  withdrawnAt: null,
  deletedAt: null,
};

function envelope(): LocalExportEnvelope<Record<string, unknown>> {
  return {
    format: LOCAL_CONTRACT_FORMAT,
    version: LOCAL_CONTRACT_VERSION,
    mode: LOCAL_DEMO_MODE,
    tool: "team-match",
    exportedAt: timestamp,
    activeIdentityId: identity.id,
    identities: [identity, participantIdentity],
    activities: [activity],
    participants: [participant],
    data: { invitations: [] },
  };
}

test("validates the versioned local envelope and keeps tool payload opaque", () => {
  const parsed = validateLocalEnvelope(envelope(), "team-match");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.data && typeof parsed.data === "object", true);
  assert.equal(parsed.participants[0].profile.nickname, "参与者");
});

test("rejects wrong tool, duplicate ids, unsupported mode, and unsafe ids", () => {
  assert.throws(() => validateLocalEnvelope(envelope(), "vote-wall"), /不属于当前工具/);

  const duplicated = envelope();
  duplicated.identities = [identity, { ...participantIdentity, id: identity.id }];
  assert.throws(() => validateLocalEnvelope(duplicated), /身份 ID不能重复/);

  const unsafe = envelope();
  unsafe.activities = [{ ...activity, id: "activity/evil" }];
  assert.throws(() => validateLocalEnvelope(unsafe), /活动 ID格式无效/);

  const wrongMode = envelope();
  wrongMode.mode = "same-browser-demo";
  wrongMode.version = 1;
  wrongMode.format = "hackkit-local-tools";
  (wrongMode as { mode: string }).mode = "remote-database";
  assert.throws(() => validateLocalEnvelope(wrongMode), /同一浏览器本机演示模式/);

  const deletedActor = envelope();
  deletedActor.identities = [{ ...identity, status: "deleted", deletedAt: timestamp }, participantIdentity];
  assert.throws(() => validateLocalEnvelope(deletedActor), /当前演示身份无效/);
});

test("enforces import size and lifecycle transitions", () => {
  assert.doesNotThrow(() => assertImportSize(512 * 1024));
  assert.throws(() => assertImportSize(512 * 1024 + 1), /512 KB/);
  assert.equal(canTransitionActivity("draft", "open"), true);
  assert.equal(canTransitionActivity("closed", "open"), false);
  assert.equal(canTransitionActivity("deleted", "draft"), true);
  assert.equal(canTransitionParticipant("active", "withdrawn"), true);
  assert.equal(canTransitionParticipant("deleted", "active"), false);
});

test("resolves ownership and refuses inactive self-actions", () => {
  assert.equal(resolveActivityRole(identity.id, activity, [participant]), "host");
  assert.equal(resolveActivityRole(participantIdentity.id, activity, [participant]), "participant");
  assert.equal(resolveActivityRole("outsider", activity, [participant]), null);
  assert.equal(canPerform("manage-activity", identity.id, activity, [participant]), true);
  assert.equal(canPerform("manage-activity", participantIdentity.id, activity, [participant]), false);
  assert.equal(canActOnOwnParticipant("withdraw-self", participantIdentity.id, participant), true);
  assert.equal(
    canActOnOwnParticipant("withdraw-self", participantIdentity.id, { ...participant, status: "withdrawn" }),
    false,
  );
});
