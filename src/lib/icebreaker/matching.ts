export const MAX_PARTICIPANTS = 18;

export type Participant = {
  id: string;
  nickname: string;
  skills: string[];
  interests: string[];
};

export type PairScore = {
  affinity: number;
  previousMeetings: number;
  commonInterests: string[];
  firstOnlySkills: string[];
  secondOnlySkills: string[];
};

export type MatchPair = {
  participantIds: [string, string];
  score: PairScore;
  evidence: string[];
  conversationPrompt: string;
};

export type MatchRound = {
  number: number;
  pairs: MatchPair[];
  byeParticipantId: string | null;
  unmatchedParticipantIds: string[];
  repeatedPairCount: number;
  reuseReason: "all_pairs_used" | "no_complete_fresh_round" | null;
};

export type MatchInput = {
  participants: Participant[];
  excludedPairKeys?: string[];
  history?: MatchRound[];
};

export type ParticipantValidation = {
  duplicateNicknames: string[];
  emptyNicknameIds: string[];
  participantsWithNoTags: string[];
};

type Candidate = {
  pairs: MatchPair[];
  unmatchedIds: string[];
  matchedCount: number;
  byeBurden: number;
  recentByeBurden: number;
  repeatedPairCount: number;
  repeatOccurrences: number;
  affinity: number;
  signature: string;
};

export function pairKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join("::");
}

export function normalizeTags(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("zh-CN");
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function validateParticipants(participants: Participant[]): ParticipantValidation {
  const nicknameCounts = new Map<string, number>();
  const emptyNicknameIds: string[] = [];
  const participantsWithNoTags: string[] = [];

  for (const participant of participants) {
    const nickname = participant.nickname.trim();
    if (!nickname) {
      emptyNicknameIds.push(participant.id);
    } else {
      const key = nickname.toLocaleLowerCase("zh-CN");
      nicknameCounts.set(key, (nicknameCounts.get(key) ?? 0) + 1);
    }
    if (normalizeTags(participant.skills).length === 0 && normalizeTags(participant.interests).length === 0) {
      participantsWithNoTags.push(participant.id);
    }
  }

  const duplicateNicknames = participants
    .map((participant) => participant.nickname.trim())
    .filter((nickname, index, values) => {
      if (!nickname || values.indexOf(nickname) !== index) return false;
      return (nicknameCounts.get(nickname.toLocaleLowerCase("zh-CN")) ?? 0) > 1;
    });

  return { duplicateNicknames, emptyNicknameIds, participantsWithNoTags };
}

export function generateRound({
  participants,
  excludedPairKeys = [],
  history = [],
}: MatchInput): MatchRound {
  if (participants.length < 2) throw new Error("至少需要 2 名参与者才能开始一轮。");
  if (participants.length > MAX_PARTICIPANTS) {
    throw new Error(`为保证本地精确匹配，单场活动最多支持 ${MAX_PARTICIPANTS} 人。`);
  }

  const validation = validateParticipants(participants);
  if (validation.emptyNicknameIds.length > 0) throw new Error("参与者昵称不能为空。");
  if (validation.duplicateNicknames.length > 0) throw new Error("参与者昵称不能重复。");
  if (new Set(participants.map((participant) => participant.id)).size !== participants.length) {
    throw new Error("参与者 ID 不能重复。");
  }

  const excluded = new Set(excludedPairKeys);
  const meetingCounts = new Map<string, number>();
  const byeCounts = new Map<string, number>();
  const lastByeRound = new Map<string, number>();

  history.forEach((round, index) => {
    for (const pair of round.pairs) {
      const key = pairKey(...pair.participantIds);
      meetingCounts.set(key, (meetingCounts.get(key) ?? 0) + 1);
    }
    for (const participantId of round.unmatchedParticipantIds) {
      byeCounts.set(participantId, (byeCounts.get(participantId) ?? 0) + 1);
      lastByeRound.set(participantId, index);
    }
  });

  const pairLookup = new Map<string, MatchPair>();
  for (let first = 0; first < participants.length; first += 1) {
    for (let second = first + 1; second < participants.length; second += 1) {
      const key = pairKey(participants[first].id, participants[second].id);
      if (!excluded.has(key)) {
        pairLookup.set(`${first}:${second}`, buildPair(participants[first], participants[second], meetingCounts.get(key) ?? 0));
      }
    }
  }

  const memo = new Map<number, Candidate>();
  const solve = (mask: number): Candidate => {
    const cached = memo.get(mask);
    if (cached) return cached;
    if (mask === 0) return emptyCandidate();

    const first = firstSetBit(mask, participants.length);
    const withoutFirst = mask & ~(1 << first);
    let best = addUnmatched(solve(withoutFirst), participants[first].id, byeCounts, lastByeRound);

    for (let second = first + 1; second < participants.length; second += 1) {
      if ((withoutFirst & (1 << second)) === 0) continue;
      const pair = pairLookup.get(`${first}:${second}`);
      if (!pair) continue;
      const remainder = withoutFirst & ~(1 << second);
      const candidate = addPair(solve(remainder), pair);
      if (isBetter(candidate, best)) best = candidate;
    }

    memo.set(mask, best);
    return best;
  };

  const best = solve((1 << participants.length) - 1);
  const allowedPairs = [...pairLookup.values()];
  const allAllowedPairsUsed = allowedPairs.length > 0 && allowedPairs.every((pair) => pair.score.previousMeetings > 0);
  const reuseReason = best.repeatedPairCount === 0
    ? null
    : allAllowedPairsUsed
      ? "all_pairs_used"
      : "no_complete_fresh_round";
  const singleOddBye = participants.length % 2 === 1 && best.unmatchedIds.length === 1
    ? best.unmatchedIds[0]
    : null;

  return {
    number: history.length + 1,
    pairs: best.pairs,
    byeParticipantId: singleOddBye,
    unmatchedParticipantIds: best.unmatchedIds,
    repeatedPairCount: best.repeatedPairCount,
    reuseReason,
  };
}

function buildPair(first: Participant, second: Participant, previousMeetings: number): MatchPair {
  const firstInterests = normalizeTags(first.interests);
  const secondInterests = normalizeTags(second.interests);
  const firstSkills = normalizeTags(first.skills);
  const secondSkills = normalizeTags(second.skills);
  const commonInterests = intersection(firstInterests, secondInterests);
  const firstOnlySkills = difference(firstSkills, secondSkills);
  const secondOnlySkills = difference(secondSkills, firstSkills);
  const skillSignalCount = Math.min(firstOnlySkills.length, 2) + Math.min(secondOnlySkills.length, 2);
  const affinity = commonInterests.length * 4 + skillSignalCount;
  const evidence: string[] = [];

  if (commonInterests.length > 0) evidence.push(`共同兴趣：${commonInterests.join("、")}`);
  if (firstOnlySkills.length > 0) evidence.push(`${first.nickname} 的不同技能：${firstOnlySkills.join("、")}`);
  if (secondOnlySkills.length > 0) evidence.push(`${second.nickname} 的不同技能：${secondOnlySkills.join("、")}`);
  if (evidence.length === 0) evidence.push("双方未填写可比较的共同兴趣或不同技能标签");

  return {
    participantIds: [first.id, second.id],
    score: { affinity, previousMeetings, commonInterests, firstOnlySkills, secondOnlySkills },
    evidence,
    conversationPrompt: makePrompt(first, second, commonInterests, firstOnlySkills, secondOnlySkills),
  };
}

function makePrompt(
  first: Participant,
  second: Participant,
  commonInterests: string[],
  firstOnlySkills: string[],
  secondOnlySkills: string[],
) {
  if (commonInterests.length > 0) {
    return `你们都填写了「${commonInterests[0]}」，可以先聊聊各自最想探索的一个具体方向。`;
  }
  if (firstOnlySkills.length > 0 && secondOnlySkills.length > 0) {
    return `${first.nickname} 可以从「${firstOnlySkills[0]}」切入，${second.nickname} 可以用「${secondOnlySkills[0]}」补充另一种技能视角。`;
  }
  if (firstOnlySkills.length > 0) {
    return `${first.nickname} 可以介绍「${firstOnlySkills[0]}」的实践，${second.nickname} 可以从自己的现场目标继续追问。`;
  }
  if (secondOnlySkills.length > 0) {
    return `${second.nickname} 可以介绍「${secondOnlySkills[0]}」的实践，${first.nickname} 可以从自己的现场目标继续追问。`;
  }
  return "双方都未填写技能或兴趣标签，可以先各用一句话说明今天最想交流的主题。";
}

function emptyCandidate(): Candidate {
  return {
    pairs: [],
    unmatchedIds: [],
    matchedCount: 0,
    byeBurden: 0,
    recentByeBurden: 0,
    repeatedPairCount: 0,
    repeatOccurrences: 0,
    affinity: 0,
    signature: "",
  };
}

function addUnmatched(
  candidate: Candidate,
  participantId: string,
  byeCounts: Map<string, number>,
  lastByeRound: Map<string, number>,
): Candidate {
  const unmatchedIds = [participantId, ...candidate.unmatchedIds];
  return {
    ...candidate,
    unmatchedIds,
    byeBurden: candidate.byeBurden + (byeCounts.get(participantId) ?? 0),
    recentByeBurden: candidate.recentByeBurden + (lastByeRound.get(participantId) ?? -1),
    signature: signature(candidate.pairs, unmatchedIds),
  };
}

function addPair(candidate: Candidate, pair: MatchPair): Candidate {
  const pairs = [pair, ...candidate.pairs];
  return {
    ...candidate,
    pairs,
    matchedCount: candidate.matchedCount + 2,
    repeatedPairCount: candidate.repeatedPairCount + Number(pair.score.previousMeetings > 0),
    repeatOccurrences: candidate.repeatOccurrences + pair.score.previousMeetings,
    affinity: candidate.affinity + pair.score.affinity,
    signature: signature(pairs, candidate.unmatchedIds),
  };
}

function isBetter(candidate: Candidate, current: Candidate) {
  const comparisons: Array<[number, number, "high" | "low"]> = [
    [candidate.matchedCount, current.matchedCount, "high"],
    [candidate.byeBurden, current.byeBurden, "low"],
    [candidate.recentByeBurden, current.recentByeBurden, "low"],
    [candidate.repeatedPairCount, current.repeatedPairCount, "low"],
    [candidate.repeatOccurrences, current.repeatOccurrences, "low"],
    [candidate.affinity, current.affinity, "high"],
  ];
  for (const [left, right, direction] of comparisons) {
    if (left === right) continue;
    return direction === "high" ? left > right : left < right;
  }
  return candidate.signature.localeCompare(current.signature) < 0;
}

function signature(pairs: MatchPair[], unmatchedIds: string[]) {
  const pairPart = pairs.map((pair) => pairKey(...pair.participantIds)).sort().join("|");
  return `${pairPart}~${[...unmatchedIds].sort().join("|")}`;
}

function firstSetBit(mask: number, length: number) {
  for (let index = 0; index < length; index += 1) {
    if ((mask & (1 << index)) !== 0) return index;
  }
  return -1;
}

function intersection(first: string[], second: string[]) {
  const secondKeys = new Set(second.map((value) => value.toLocaleLowerCase("zh-CN")));
  return first.filter((value) => secondKeys.has(value.toLocaleLowerCase("zh-CN")));
}

function difference(first: string[], second: string[]) {
  const secondKeys = new Set(second.map((value) => value.toLocaleLowerCase("zh-CN")));
  return first.filter((value) => !secondKeys.has(value.toLocaleLowerCase("zh-CN")));
}
