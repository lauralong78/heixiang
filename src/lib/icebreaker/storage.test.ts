import assert from "node:assert/strict";
import { test } from "node:test";

import { restoreActivity } from "./storage";

test("rejects malformed saved rounds instead of restoring a crashing state", () => {
  const malformed = JSON.stringify({
    activityName: "旧活动",
    participants: [],
    excludedPairKeys: [],
    rounds: [{}],
  });

  assert.equal(restoreActivity(malformed), null);
  assert.equal(restoreActivity("not json"), null);
});

test("restores a structurally valid local activity", () => {
  const saved = JSON.stringify({
    activityName: "现场夜",
    participants: [
      { id: "a", nickname: "阿青", skills: ["React"], interests: ["教育"] },
      { id: "b", nickname: "小北", skills: ["路演"], interests: ["教育"] },
    ],
    excludedPairKeys: [],
    rounds: [{
      number: 1,
      generatedAt: "2026-09-26T00:00:00.000Z",
      pairs: [{
        participantIds: ["a", "b"],
        score: {
          affinity: 6,
          previousMeetings: 0,
          commonInterests: ["教育"],
          firstOnlySkills: ["React"],
          secondOnlySkills: ["路演"],
        },
        evidence: ["共同兴趣：教育"],
        conversationPrompt: "你们都填写了教育。",
      }],
      byeParticipantId: null,
      unmatchedParticipantIds: [],
      repeatedPairCount: 0,
      reuseReason: null,
    }],
  });

  const restored = restoreActivity(saved);
  assert.equal(restored?.activityName, "现场夜");
  assert.equal(restored?.rounds.length, 1);
});
