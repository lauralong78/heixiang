import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentRequest, makeOperationId, resultFor, visibleOptions } from "./formal-vote-wall-state";

const snapshot = {
  poll: { id: "poll", activity_id: "activity", title: "x", description: "", choice_mode: "single-choice" as const, status: "open" as const, result_mode: "hidden" as const, host_eligible: false, allow_self_vote: false, data_version: 1, created_by: "user", closed_at: null },
  options: [
    { id: "one", poll_id: "poll", title: "One", description: "", link: null, submitted_by: null, status: "published" as const },
    { id: "two", poll_id: "poll", title: "Two", description: "", link: null, submitted_by: null, status: "removed" as const },
  ],
  results: [{ optionId: "one", count: null, recordedForViewer: true }],
  viewerVote: { voteId: "vote", optionId: "one", status: "active" },
};

test("HK-311 operationId is bounded and unique-shaped", () => {
  const first = makeOperationId();
  const second = makeOperationId();
  assert.notEqual(first, second);
  assert.match(first, /^formal-vote-[a-z0-9-]{8,96}$/i);
  assert.ok(first.length <= 96);
});

test("HK-311 renders only visible options and API result values", () => {
  assert.deepEqual(visibleOptions(snapshot).map((option) => option.id), ["one"]);
  assert.deepEqual(resultFor(snapshot, "one"), { optionId: "one", count: null, recordedForViewer: true });
  assert.deepEqual(resultFor(snapshot, "missing"), { optionId: "missing", count: null, recordedForViewer: false });
});

test("HK-311 rejects stale responses after activity changes", () => {
  assert.equal(isCurrentRequest(4, 4, "new-activity", "new-activity"), true);
  assert.equal(isCurrentRequest(3, 4, "new-activity", "new-activity"), false);
  assert.equal(isCurrentRequest(4, 4, "old-activity", "new-activity"), false);
});
