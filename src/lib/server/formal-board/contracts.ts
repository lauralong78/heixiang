export const FORMAL_BOARD_ROLES = ["member", "collaborator", "host"] as const;
export type FormalBoardRole = (typeof FORMAL_BOARD_ROLES)[number];

export const FORMAL_BOARD_MEMBERSHIP_STATUSES = ["active", "left", "removed"] as const;
export type FormalBoardMembershipStatus = (typeof FORMAL_BOARD_MEMBERSHIP_STATUSES)[number];

export const FORMAL_BOARD_ACTIVITY_STATUSES = ["draft", "open", "paused", "closed", "archived", "deleted"] as const;
export type FormalBoardActivityStatus = (typeof FORMAL_BOARD_ACTIVITY_STATUSES)[number];

export const FORMAL_BOARD_ACTIONS = [
  "activity.create",
  "activity.update",
  "activity.delete",
  "membership.invite",
  "membership.join",
  "membership.update_role",
  "membership.remove",
  "team.create",
  "team.update",
  "team.delete",
  "task.create",
  "task.update",
  "task.delete",
  "attachment.upload",
  "attachment.delete",
] as const;
export type FormalBoardAction = (typeof FORMAL_BOARD_ACTIONS)[number];

export type FormalBoardResource = "activity" | "membership" | "team" | "task" | "attachment";

export type MembershipSnapshot = {
  role: FormalBoardRole;
  status: FormalBoardMembershipStatus;
};

export type AuthorizationContext = {
  userId: string;
  membership: MembershipSnapshot | null;
  activityStatus: FormalBoardActivityStatus;
};

export type ApiSuccess<T> = { ok: true; data: T; requestId: string };

export type ApiFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "RATE_LIMITED"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiFailure = {
  ok: false;
  error: { code: ApiFailureCode; message: string; retryable: boolean };
  requestId: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function isFormalBoardRole(value: unknown): value is FormalBoardRole {
  return typeof value === "string" && (FORMAL_BOARD_ROLES as readonly string[]).includes(value);
}

export function isFormalBoardActivityStatus(value: unknown): value is FormalBoardActivityStatus {
  return typeof value === "string" && (FORMAL_BOARD_ACTIVITY_STATUSES as readonly string[]).includes(value);
}

export function normalizeOperationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/.test(normalized)) return null;
  return normalized;
}

export function makeApiFailure(
  requestId: string,
  code: ApiFailureCode,
  message: string,
  retryable = false,
): ApiFailure {
  return { ok: false, error: { code, message, retryable }, requestId };
}
