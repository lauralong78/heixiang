import "server-only";

import { supabaseRestRequest } from "./supabase-rest";
import { canDeleteAttachment } from "./permissions";
import type { FormalBoardMembershipStatus, FormalBoardRole } from "./contracts";

export type AttachmentRow = { id: string; activity_id: string; team_id: string | null; task_id: string | null; uploaded_by: string; original_name: string; media_type: string; size_bytes: number; sha256: string; status: string; created_at: string };
type MembershipRow = { role: FormalBoardRole; status: FormalBoardMembershipStatus };

async function membership(userId: string, activityId: string) {
  const rows = await supabaseRestRequest<MembershipRow[]>(`memberships?activity_id=eq.${encodeURIComponent(activityId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=role,status`);
  return rows[0] ?? null;
}

export async function listAttachments(userId: string, activityId: string) {
  if (!await membership(userId, activityId)) throw new Error("FORBIDDEN");
  return supabaseRestRequest<AttachmentRow[]>(`attachments?activity_id=eq.${encodeURIComponent(activityId)}&status=eq.active&select=id,activity_id,team_id,task_id,uploaded_by,original_name,media_type,size_bytes,sha256,status,created_at&order=created_at.desc`);
}

export async function deleteAttachment(userId: string, activityId: string, attachmentId: string) {
  const current = await membership(userId, activityId);
  if (!current) throw new Error("FORBIDDEN");
  const target = await supabaseRestRequest<Pick<AttachmentRow, "id" | "uploaded_by">[]>(`attachments?id=eq.${encodeURIComponent(attachmentId)}&activity_id=eq.${encodeURIComponent(activityId)}&status=eq.active&select=id,uploaded_by`);
  if (!target[0] || !canDeleteAttachment(userId, target[0].uploaded_by, current.role, current.status)) throw new Error("FORBIDDEN");
  const rows = await supabaseRestRequest<AttachmentRow[]>(`attachments?id=eq.${encodeURIComponent(attachmentId)}&activity_id=eq.${encodeURIComponent(activityId)}&status=eq.active&select=id`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "deleted", deleted_at: new Date().toISOString() }),
  });
  if (!rows[0]) throw new Error("NOT_FOUND");
}
