import "server-only";

import { supabaseRestRpc } from "./supabase-rest";

export type TeamRow = { id: string; name: string; description: string; task_count: number; sort_order: number };

export function listTeams(userId: string, activityId: string) {
  return supabaseRestRpc<TeamRow[]>("formal_list_activity_teams", {
    p_user_id: userId,
    p_activity_id: activityId,
  });
}

export async function createTeam(input: { userId: string; activityId: string; name: string; description: string; requestId: string }) {
  const rows = await supabaseRestRpc<TeamRow[]>("formal_create_team", {
    p_user_id: input.userId,
    p_activity_id: input.activityId,
    p_name: input.name,
    p_description: input.description,
    p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Team creation returned no team.");
  return rows[0];
}
