export type Result = { optionId: string; count: number | null; recordedForViewer: boolean };
export type VisibleOption = { id: string; status: "published" | "withdrawn" | "removed" };
export type SnapshotLike = { options: VisibleOption[]; results: Result[] };
export type VoteButtonState = "available" | "already-voted" | "host-ineligible" | "unavailable";

export function voteButtonState(
  snapshot: { poll: { status: "draft" | "open" | "closed"; host_eligible: boolean }; viewerVote: unknown | null },
  isHost: boolean,
  activityStatus: string | undefined,
  optionStatus: VisibleOption["status"],
): VoteButtonState {
  if (optionStatus !== "published" || snapshot.poll.status !== "open" || activityStatus !== "open") return "unavailable";
  if (snapshot.viewerVote) return "already-voted";
  if (isHost && !snapshot.poll.host_eligible) return "host-ineligible";
  return "available";
}

export function makeOperationId(prefix = "formal-vote") {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`.slice(0, 96);
}

export function isCurrentRequest(requestId: number, latestRequestId: number, activityId: string | null, currentActivityId: string | null) {
  return requestId === latestRequestId && activityId === currentActivityId;
}

export function visibleOptions<T extends VisibleOption>(snapshot: { options: T[] } | null): T[] {
  return snapshot?.options.filter((option) => option.status !== "removed") ?? [];
}

export function resultFor(snapshot: SnapshotLike, optionId: string) {
  return snapshot.results.find((result) => result.optionId === optionId) ?? { optionId, count: null, recordedForViewer: false };
}
