import "server-only";

import { supabaseRestRpc } from "./supabase-rest";

export type TeamRow = { id: string; name: string; description: string; task_count: number; sort_order: number; data_version?: number; team_role?: "captain" | "member" };

export function listTeams(userId: string, activityId: string) {
  return supabaseRestRpc<TeamRow[]>("formal_list_activity_teams_v3", {
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

export async function updateTeam(input: { userId: string; activityId: string; teamId: string; name: string; description: string; expectedVersion: number; requestId: string }) {
  const rows = await supabaseRestRpc<TeamRow[]>("formal_update_team", { p_user_id: input.userId, p_activity_id: input.activityId, p_team_id: input.teamId, p_name: input.name, p_description: input.description, p_expected_version: input.expectedVersion, p_request_id: input.requestId });
  if (!rows[0]) throw new Error("Team update returned no team.");
  return rows[0];
}

export function deleteTeam(input: { userId: string; activityId: string; teamId: string; expectedVersion: number; requestId: string }) {
  return supabaseRestRpc<unknown[]>("formal_delete_team", { p_user_id: input.userId, p_activity_id: input.activityId, p_team_id: input.teamId, p_expected_version: input.expectedVersion, p_request_id: input.requestId });
}
