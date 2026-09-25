import assert from "node:assert/strict";
import { test } from "node:test";

import { generateRound, pairKey, type MatchRound, type Participant } from "./matching";

function people(count: number): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    nickname: `成员${index + 1}`,
    skills: [`技能${index + 1}`],
    interests: [index % 2 === 0 ? "AI" : "教育"],
  }));
}

test("four participants avoid repeats until all six pair combinations are used", () => {
  const participants = people(4);
  const first = generateRound({ participants });
  const second = generateRound({ participants, history: [first] });
  const third = generateRound({ participants, history: [first, second] });
  const fourth = generateRound({ participants, history: [first, second, third] });
  const firstThreeKeys = [first, second, third].flatMap((round) =>
    round.pairs.map((pair) => pairKey(...pair.participantIds)),
  );

  assert.equal(new Set(firstThreeKeys).size, 6);
  assert.equal(first.repeatedPairCount, 0);
  assert.equal(second.repeatedPairCount, 0);
  assert.equal(third.repeatedPairCount, 0);
  assert.equal(fourth.repeatedPairCount, 2);
  assert.equal(fourth.reuseReason, "all_pairs_used");
});

test("odd participant byes rotate fairly across rounds", () => {
  const participants = people(5);
  const rounds: MatchRound[] = [];
  for (let index = 0; index < 5; index += 1) {
    rounds.push(generateRound({ participants, history: rounds }));
  }

  const byes = rounds.map((round) => round.byeParticipantId);
  assert.equal(byes.every(Boolean), true);
  assert.equal(new Set(byes).size, 5);
});

test("exclusions report participants that cannot be fully matched", () => {
  const participants = people(4);
  const exclusions = [
    pairKey("p1", "p2"),
    pairKey("p1", "p3"),
    pairKey("p1", "p4"),
  ];
  const round = generateRound({ participants, excludedPairKeys: exclusions });

  assert.equal(round.pairs.length, 1);
  assert.equal(round.unmatchedParticipantIds.length, 2);
  assert.ok(round.unmatchedParticipantIds.includes("p1"));
  assert.equal(round.byeParticipantId, null);
});

test("matching evidence and prompts only use submitted fields", () => {
  const participants: Participant[] = [
    { id: "a", nickname: "阿青", skills: ["React"], interests: ["教育"] },
    { id: "b", nickname: "小北", skills: ["路演"], interests: ["教育"] },
  ];
  const round = generateRound({ participants });
  const [pair] = round.pairs;

  assert.deepEqual(pair.score.commonInterests, ["教育"]);
  assert.match(pair.evidence.join(" "), /教育/);
  assert.match(pair.conversationPrompt, /教育/);
  assert.equal(pair.conversationPrompt.includes("金融"), false);
});
