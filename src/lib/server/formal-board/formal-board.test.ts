import assert from "node:assert/strict";
import test from "node:test";

import { decideIdempotency } from "./idempotency";
import { canEditOwnContact, canJoinActivity, canPerformAction, canWriteBoardResource } from "./permissions";
import { makeApiFailure, normalizeOperationId } from "./contracts";

const activeHost = { userId: "user-a", membership: { role: "host" as const, status: "active" as const }, activityStatus: "open" as const };
const activeCollaborator = { userId: "user-b", membership: { role: "collaborator" as const, status: "active" as const }, activityStatus: "open" as const };
const activeMember = { userId: "user-c", membership: { role: "member" as const, status: "active" as const }, activityStatus: "open" as const };

test("server-side permission derives authority from membership role", () => {
  assert.equal(canPerformAction({ ...activeMember, membership: null }, "activity.create"), true);
  assert.equal(canPerformAction(activeHost, "membership.remove"), true);
  assert.equal(canPerformAction(activeCollaborator, "membership.remove"), false);
  assert.equal(canPerformAction(activeMember, "team.create"), false);
  assert.equal(canPerformAction({ ...activeCollaborator, membership: null }, "team.create"), false);
});

test("joining requires a valid invitation and does not trust a client role", () => {
  assert.equal(canJoinActivity(true, null), true);
  assert.equal(canJoinActivity(false, null), false);
  assert.equal(canJoinActivity(true, activeMember.membership), false);
});

test("closed activities reject new board writes", () => {
  assert.equal(canWriteBoardResource({ ...activeCollaborator, activityStatus: "closed" }, "task.update"), false);
  assert.equal(canWriteBoardResource({ ...activeHost, activityStatus: "closed" }, "activity.update"), false);
});

test("contact changes are owner-only and active-membership-only", () => {
  assert.equal(canEditOwnContact("user-a", "user-a", "active"), true);
  assert.equal(canEditOwnContact("user-a", "user-b", "active"), false);
  assert.equal(canEditOwnContact("user-a", "user-a", "left"), false);
});

test("idempotency replays equal requests and rejects changed parameters", () => {
  const existing = { operationId: "op-12345678", requestFingerprint: "same", responseJson: "{\"ok\":true}", createdAt: "2026-09-28T00:00:00.000Z" };
  assert.deepEqual(decideIdempotency(null, existing.operationId, "same"), { kind: "execute" });
  assert.deepEqual(decideIdempotency(existing, existing.operationId, "same"), { kind: "replay", responseJson: existing.responseJson });
  assert.deepEqual(decideIdempotency(existing, existing.operationId, "changed"), { kind: "reject", code: "IDEMPOTENCY_KEY_REUSED" });
});

test("operation ids and API failures are bounded and safe", () => {
  assert.equal(normalizeOperationId(" op-12345678 "), "op-12345678");
  assert.equal(normalizeOperationId("short"), null);
  assert.equal(normalizeOperationId("<script>alert(1)</script>"), null);
  assert.deepEqual(makeApiFailure("req-1", "FORBIDDEN", "没有权限执行此操作。"), {
    ok: false,
    error: { code: "FORBIDDEN", message: "没有权限执行此操作。", retryable: false },
    requestId: "req-1",
  });
});
