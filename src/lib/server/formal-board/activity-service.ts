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
  return supabaseRestRpc<ActivityRow[]>("formal_list_accessible_activities", { p_user_id: userId });
}
