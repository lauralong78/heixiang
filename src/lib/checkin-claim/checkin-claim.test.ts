import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addError, createCheckinState, createRosterEntry, csvForActivity, digestCredential, parseBackupText,
  recordAction, serializeBackup, setRosterStatus, voidRecord,
  type CheckinClaimState,
} from "./checkin-claim";

async function fixture() {
  let state = createCheckinState("主持人", "签到测试", "check-in-and-claim");
  const activityId = state.activities[0].id; const hostId = state.activeIdentityId!;
  const first = await createRosterEntry(state, activityId, hostId, "阿花"); state = first.state;
  const second = await createRosterEntry(state, activityId, hostId, "阿强"); state = second.state;
  state = { ...state, activities: state.activities.map((item) => ({ ...item, status: "open" as const })) };
  return { state, activityId, hostId, first: first.created, second: second.created };
}

test("credential comparison stores only a SHA-256 digest", async () => {
  const digest = await digestCredential("ABCD-1234");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, "ABCD-1234");
});

test("check-in and claim have independent idempotency keys", async () => {
  const f = await fixture();
  const checked = await recordAction(f.state, f.activityId, f.hostId, f.first.credential, "check-in");
  const repeated = await recordAction(checked.state, f.activityId, f.hostId, f.first.credential, "check-in");
  assert.equal(repeated.code, "ALREADY_RECORDED");
  const claimed = await recordAction(repeated.state, f.activityId, f.hostId, f.first.credential, "claim");
  assert.equal(claimed.code, "RECORDED");
  assert.equal(claimed.state.data.records.length, 2);
});

test("unknown, malformed and inactive credentials become safe errors without raw credential", async () => {
  const f = await fixture();
  await assert.rejects(() => recordAction(f.state, f.activityId, f.hostId, "BAD", "check-in"), { code: "INVALID_INPUT" });
  await assert.rejects(() => recordAction(f.state, f.activityId, f.hostId, "AAAA-BBBB", "check-in"), { code: "UNKNOWN_CREDENTIAL" });
  const inactive = setRosterStatus(f.state, f.activityId, f.hostId, f.first.entry.id, "withdrawn");
  assert.equal(inactive.data.roster[0].label, "已退出成员");
  await assert.rejects(() => recordAction(inactive, f.activityId, f.hostId, f.first.credential, "check-in"), { code: "ROSTER_INACTIVE" });
  const safe = addError(f.state, { activityId: f.activityId, code: "UNKNOWN_CREDENTIAL", occurredAt: new Date().toISOString(), actorIdentityId: f.hostId, rosterEntryId: null, reason: "无匹配摘要" });
  assert.equal(JSON.stringify(safe).includes("AAAA-BBBB"), false);
});

test("void requires a reason and allows a later re-record while retaining audit history", async () => {
  const f = await fixture(); const recorded = await recordAction(f.state, f.activityId, f.hostId, f.first.credential, "check-in");
  assert.throws(() => voidRecord(recorded.state, f.activityId, f.hostId, recorded.record.id, ""), { code: "INVALID_INPUT" });
  const voided = voidRecord(recorded.state, f.activityId, f.hostId, recorded.record.id, "核对名单后重录");
  const rerecorded = await recordAction(voided, f.activityId, f.hostId, f.first.credential, "check-in");
  assert.equal(rerecorded.state.data.records.filter((item) => item.actionKind === "check-in").length, 2);
  assert.equal(rerecorded.state.data.records[0].status, "voided");
});

test("CSV uses fixed fields, quotes delimiters, and neutralizes formula prefixes", async () => {
  const f = await fixture(); const recorded = await recordAction(f.state, f.activityId, f.hostId, f.first.credential, "check-in");
  const malicious: CheckinClaimState = { ...recorded.state, activities: recorded.state.activities.map((item) => ({ ...item, title: "=SUM(A1)\n活动" })), data: { ...recorded.state.data, roster: recorded.state.data.roster.map((item) => item.id === f.first.entry.id ? { ...item, label: "@恶意,\"名字\"" } : item) } };
  const csv = csvForActivity(malicious, f.activityId);
  assert.match(csv, /"'=SUM\(A1\)\n活动"/);
  assert.match(csv, /"'@恶意,""名字"""/);
  assert.equal(csv.split("\r\n")[0], '"activityId","activityTitle","rosterEntryId","participantLabel","actionKind","status","recordedAt","recordId","voidReason"');
});

test("backup round trip works and malformed/oversized data is rejected before writing", async () => {
  const f = await fixture(); const backup = serializeBackup(f.state); const restored = parseBackupText(backup);
  assert.equal(restored.data.roster[0].credentialDigest, f.first.entry.credentialDigest);
  assert.throws(() => parseBackupText("{"), /损坏/);
  assert.throws(() => parseBackupText(`${"x".repeat(512 * 1024)}\n`), /512 KB/);
  const unsafe = JSON.parse(backup) as Record<string, unknown>; (unsafe.data as Record<string, unknown>).roster = [{ ...f.first.entry, credentialDigest: "raw-credential" }];
  assert.throws(() => parseBackupText(JSON.stringify(unsafe)), /凭证摘要无效/);
  const extra = JSON.parse(backup) as Record<string, unknown>;
  (extra.data as Record<string, unknown>).roster = [{ ...f.first.entry, credential: f.first.credential }];
  const sanitized = parseBackupText(JSON.stringify(extra));
  assert.equal("credential" in (sanitized.data.roster[0] as unknown as Record<string, unknown>), false);
  assert.equal(JSON.stringify(sanitized).includes(f.first.credential), false);
});
