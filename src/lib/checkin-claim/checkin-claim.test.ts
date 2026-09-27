import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addError, closeActivity, createCheckinState, createRosterEntry, csvForActivity, digestCredential, parseBackupText,
  recordAction, reissueCredential, serializeBackup, setRosterStatus, voidRecord,
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

test("participants can submit only their own credential, while viewer-like actors cannot", async () => {
  const f = await fixture();
  const participantResult = await recordAction(f.state, f.activityId, f.first.identity.id, f.first.credential, "check-in");
  assert.equal(participantResult.code, "RECORDED");
  await assert.rejects(() => recordAction(f.state, f.activityId, f.first.identity.id, f.second.credential, "check-in"), { code: "NOT_AUTHORIZED" });
  await assert.rejects(() => recordAction(f.state, f.activityId, "viewer", f.first.credential, "check-in"), { code: "NOT_AUTHORIZED" });
});

test("closed activities freeze roster creation, credential reissue, and roster status changes", async () => {
  const f = await fixture();
  const closed = closeActivity(f.state, f.activityId, f.hostId);
  await assert.rejects(() => createRosterEntry(closed, f.activityId, f.hostId, "关闭后加入"), { code: "ACTIVITY_NOT_OPEN" });
  await assert.rejects(() => reissueCredential(closed, f.activityId, f.hostId, f.first.entry.id), { code: "ACTIVITY_NOT_OPEN" });
  assert.throws(() => setRosterStatus(closed, f.activityId, f.hostId, f.first.entry.id, "withdrawn"), { code: "ACTIVITY_NOT_OPEN" });
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
  assert.throws(() => parseBackupText(JSON.stringify(unsafe)), /凭证摘要格式无效/);
  const extra = JSON.parse(backup) as Record<string, unknown>;
  (extra.data as Record<string, unknown>).roster = [{ ...f.first.entry, credential: f.first.credential }];
  assert.throws(() => parseBackupText(JSON.stringify(extra)), /不得包含原始凭证/);
});

test("deep import validation rejects dangling ids, non-canonical dates, duplicate business keys, and bad error codes", async () => {
  const f = await fixture();
  const recorded = await recordAction(f.state, f.activityId, f.hostId, f.first.credential, "check-in");
  const backup = JSON.parse(serializeBackup(recorded.state)) as Record<string, unknown>;
  const data = backup.data as Record<string, unknown>;
  const records = data.records as Array<Record<string, unknown>>;
  assert.throws(() => parseBackupText(JSON.stringify({ ...backup, data: { ...data, records: [...records, { ...records[0], id: "record-2", recordId: "record-3" }] } })), /业务唯一键重复/);
  assert.throws(() => parseBackupText(JSON.stringify({ ...backup, data: { ...data, records: [{ ...records[0], recordedAt: "2026-09-27T00:00:00Z" }] } })), /记录时间格式无效/);
  const errors = data.errors as Array<Record<string, unknown>>;
  assert.throws(() => parseBackupText(JSON.stringify({ ...backup, data: { ...data, errors: [{ id: "error-1", activityId: "missing", code: "NOPE", occurredAt: "2026-09-27T00:00:00.000Z", actorIdentityId: f.hostId, rosterEntryId: null, reason: "x" }] } })), /异常事件存在重复 ID、悬空引用或非法错误码/);
  assert.equal(errors.length, 0);
});

test("deep import validation rejects invalid roster status and duplicate credential digests", async () => {
  const f = await fixture();
  const backup = JSON.parse(serializeBackup(f.state)) as Record<string, unknown>;
  const data = backup.data as Record<string, unknown>;
  const roster = data.roster as Array<Record<string, unknown>>;
  assert.throws(() => parseBackupText(JSON.stringify({ ...backup, data: { ...data, roster: [{ ...roster[0], status: "mystery" }] } })), /名单状态枚举无效/);
  assert.throws(() => parseBackupText(JSON.stringify({ ...backup, data: { ...data, roster: [{ ...roster[0] }, { ...roster[1], credentialDigest: roster[0].credentialDigest }] } })), /凭证摘要不能重复/);
});
