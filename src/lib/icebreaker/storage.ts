import type { MatchPair, MatchRound, Participant } from "./matching";

export type ActivityRound = MatchRound & { generatedAt: string };

export type ActivityState = {
  activityName: string;
  participants: Participant[];
  excludedPairKeys: string[];
  rounds: ActivityRound[];
};

export const EMPTY_ACTIVITY: ActivityState = {
  activityName: "",
  participants: [],
  excludedPairKeys: [],
  rounds: [],
};

export function restoreActivity(raw: string): ActivityState | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.activityName !== "string"
      || !Array.isArray(value.participants) || !value.participants.every(isParticipant)
      || !isStringArray(value.excludedPairKeys) || !Array.isArray(value.rounds)
      || !value.rounds.every(isActivityRound)) return null;

    return {
      activityName: value.activityName,
      participants: value.participants,
      excludedPairKeys: value.excludedPairKeys,
      rounds: value.rounds,
    };
  } catch {
    return null;
  }
}

function isActivityRound(value: unknown): value is ActivityRound {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.number)
    && typeof value.generatedAt === "string"
    && Array.isArray(value.pairs)
    && value.pairs.every(isMatchPair)
    && (value.byeParticipantId === null || typeof value.byeParticipantId === "string")
    && isStringArray(value.unmatchedParticipantIds)
    && Number.isInteger(value.repeatedPairCount)
    && (value.reuseReason === null
      || value.reuseReason === "all_pairs_used"
      || value.reuseReason === "no_complete_fresh_round");
}

function isMatchPair(value: unknown): value is MatchPair {
  if (!isRecord(value) || !Array.isArray(value.participantIds)
    || value.participantIds.length !== 2 || !isStringArray(value.participantIds)
    || !isRecord(value.score) || !Array.isArray(value.evidence)) return false;
  const score = value.score;
  return typeof value.conversationPrompt === "string"
    && isStringArray(value.evidence)
    && typeof score.affinity === "number"
    && typeof score.previousMeetings === "number"
    && isStringArray(score.commonInterests)
    && isStringArray(score.firstOnlySkills)
    && isStringArray(score.secondOnlySkills);
}

function isParticipant(value: unknown): value is Participant {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.nickname === "string"
    && isStringArray(value.skills)
    && isStringArray(value.interests);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
