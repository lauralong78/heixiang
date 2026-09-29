import assert from "node:assert/strict";
import { test } from "node:test";

import { getFormalBoardStorageMode } from "./storage";
import { localCreateActivity, localCreatePoll, localCreateOption, localCastVote, localSnapshot, localUpdatePoll, localRegister } from "./local-store";

test("formal board defaults to local mode without Supabase configuration", () => {
  assert.equal(getFormalBoardStorageMode({}), "local");
  assert.equal(getFormalBoardStorageMode({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "not-used-in-test" }), "supabase");
});

test("local mode keeps vote uniqueness and server-side activity ownership", async () => {
  const userId = `local-test-${Date.now()}`;
  const registered = await localRegister(userId, "local-test-password");
  const ownerId = registered.id;
  const activity = localCreateActivity({ userId: ownerId, title: "local test", description: "", requestId: "local-test-create" });
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
