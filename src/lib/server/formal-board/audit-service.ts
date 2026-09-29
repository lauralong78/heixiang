import "server-only";

import { supabaseRestRequest } from "./supabase-rest";
import { canViewActivityAudit } from "./permissions";
import type { FormalBoardMembershipStatus, FormalBoardRole } from "./contracts";

export type AuditRow = { id: string; activity_id: string | null; actor_user_id: string | null; action: string; target_type: string; target_id: string | null; request_id: string; result: "success" | "failure"; created_at: string };
type MembershipRow = { role: FormalBoardRole; status: FormalBoardMembershipStatus };

export async function listVisibleAudit(userId: string, activityId?: string) {
  if (!activityId) return supabaseRestRequest<AuditRow[]>(`audit_events?actor_user_id=eq.${encodeURIComponent(userId)}&select=id,activity_id,actor_user_id,action,target_type,target_id,request_id,result,created_at&order=created_at.desc&limit=100`);
  const membership = await supabaseRestRequest<MembershipRow[]>(`memberships?activity_id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=role,status`);
  if (!membership[0] || !canViewActivityAudit(membership[0].role, membership[0].status)) throw new Error("FORBIDDEN");
  return supabaseRestRequest<AuditRow[]>(`audit_events?activity_id=eq.${encodeURIComponent(activityId)}&select=id,activity_id,actor_user_id,action,target_type,target_id,request_id,result,created_at&order=created_at.desc&limit=100`);
}
