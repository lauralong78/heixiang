import "server-only";

import { supabaseRestRpc } from "./supabase-rest";

export type ActivityRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  data_version: number;
  role: string;
  updated_at: string;
  deadline_at?: string | null;
};

export async function createActivity(input: { userId: string; title: string; description: string; requestId: string }) {
  const rows = await supabaseRestRpc<ActivityRow[]>("formal_create_activity", {
    p_creator_id: input.userId,
    p_title: input.title,
    p_description: input.description,
    p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Activity creation returned no activity.");
  return rows[0];
}

export function listActivities(userId: string) {
  return supabaseRestRpc<ActivityRow[]>("formal_list_accessible_activities_v2", { p_user_id: userId });
}

export async function createActivityWithDeadline(input: { userId: string; title: string; description: string; deadlineAt?: string | null; requestId: string }) {
  const rows = await supabaseRestRpc<ActivityRow[]>("formal_create_activity_v2", {
    p_creator_id: input.userId, p_title: input.title, p_description: input.description,
    p_deadline_at: input.deadlineAt ?? null, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Activity creation returned no activity.");
  return rows[0];
}
