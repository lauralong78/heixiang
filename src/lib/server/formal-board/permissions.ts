import type {
  AuthorizationContext,
  FormalBoardAction,
  FormalBoardRole,
  MembershipSnapshot,
  FormalBoardMembershipStatus,
} from "./contracts";

const HOST_ACTIONS = new Set<FormalBoardAction>([
  "activity.update",
  "activity.delete",
  "membership.invite",
  "membership.update_role",
  "membership.remove",
]);

const COLLABORATOR_ACTIONS = new Set<FormalBoardAction>([
  "team.create",
  "team.update",
  "team.delete",
  "task.create",
  "task.update",
  "task.delete",
  "attachment.upload",
  "attachment.delete",
]);

export function canPerformAction(context: AuthorizationContext, action: FormalBoardAction): boolean {
  if (action === "activity.create") return context.userId.length > 0;
  if (action === "membership.join") return false;
  if (!context.membership || context.membership.status !== "active") return false;
  if (context.activityStatus === "deleted" || context.activityStatus === "archived") return false;

  if (HOST_ACTIONS.has(action)) return context.membership.role === "host";
  if (COLLABORATOR_ACTIONS.has(action)) return isAtLeastCollaborator(context.membership.role);
  return false;
}

export function canJoinActivity(hasValidInvite: boolean, currentMembership: MembershipSnapshot | null): boolean {
  return hasValidInvite && (!currentMembership || currentMembership.status !== "active");
}

export function isAtLeastCollaborator(role: FormalBoardRole): boolean {
  return role === "collaborator" || role === "host";
}

export function canEditOwnContact(userId: string, targetUserId: string, membershipStatus: string): boolean {
  return userId === targetUserId && membershipStatus === "active";
}

export function canViewActivityAudit(role: FormalBoardRole | null, status: FormalBoardMembershipStatus | null): boolean {
  return status === "active" && (role === "host" || role === "collaborator");
}

export function canDeleteAttachment(userId: string, uploadedBy: string, role: FormalBoardRole | null, status: FormalBoardMembershipStatus | null): boolean {
  return status === "active" && (userId === uploadedBy || role === "host" || role === "collaborator");
}

export function canWriteBoardResource(context: AuthorizationContext, action: FormalBoardAction): boolean {
  if (context.activityStatus === "closed" && action !== "attachment.delete") return false;
  return canPerformAction(context, action);
}
