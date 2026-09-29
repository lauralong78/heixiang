import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { decideIdempotency } from "./idempotency";
import { parseOptionInput, parsePollInput, parsePollPatch, parseResultMode, parseVoidInput, parseVoteInput } from "./vote";

test("formal vote input is bounded and HTTPS-only", () => {
  const poll = parsePollInput({ activityId: "00000000-0000-4000-8000-000000000001", title: " Demo ", operationId: "op-12345678" });
  assert.equal(poll.title, "Demo");
  assert.equal(poll.resultMode, "hidden");
  assert.throws(() => parseOptionInput({ title: "x", link: "javascript:alert(1)", operationId: "op-12345678" }), /HTTPS/);
  assert.throws(() => parseVoteInput({ optionId: "bad", operationId: "op-12345678" }), /候选项/);
  assert.throws(() => parseVoidInput({ voteId: "00000000-0000-4000-8000-000000000001", reason: "", operationId: "op-12345678" }), /原因/);
  assert.equal(parseResultMode("final"), "final");
});

test("draft rule changes and closing carry an optimistic version", () => {
  const patch = parsePollPatch({ expectedVersion: 2, close: true, operationId: "close-12345678" });
  assert.equal(patch.expectedVersion, 2);
  assert.equal(patch.close, true);
  assert.equal(patch.operationId, "close-12345678");
  assert.throws(() => parsePollPatch({ expectedVersion: 0, operationId: "op-12345678" }), /expectedVersion/);
});

test("same operation replays while changed parameters are rejected", () => {
  const record = { operationId: "op-12345678", requestFingerprint: "poll:1:option:1", responseJson: "{}", createdAt: "2026-09-29T00:00:00.000Z" };
  assert.equal(decideIdempotency(record, record.operationId, record.requestFingerprint).kind, "replay");
  assert.equal(decideIdempotency(record, record.operationId, "poll:1:option:2").kind, "reject");
});

test("migration freezes database invariants and audit allowlist", () => {
  const sql = readFileSync("supabase/migrations/0019_formal_vote_wall.sql", "utf8");
  assert.match(sql, /unique index if not exists votes_poll_voter_uq on public\.votes\(poll_id, voter_user_id\)/i);
  assert.match(sql, /status in \('draft', 'open', 'closed'\)/i);
  assert.match(sql, /status in \('published', 'withdrawn', 'removed'\)/i);
  for (const action of ["poll.create", "poll.update", "poll.close", "poll.option.create", "poll.option.update", "vote.cast", "vote.void"]) assert.match(sql, new RegExp(`'${action.replace('.', '\\.')}'`));
  assert.match(sql, /p\.result_mode = 'live' or \(p\.result_mode = 'final' and p\.status = 'closed'\)/i);
});
