import "server-only";

import { supabaseRestRpc } from "./supabase-rest";
import { isLocalFormalBoard } from "./storage";
import { localCreateTask, localListTasks, localUpdateTaskDetails, localUpdateTaskProgress, localUpdateTaskStatus } from "./local-store";

export type TaskRow = { id: string; team_id: string; title: string; description: string; status: string; progress: number; data_version: number; assigned_to_current_user?: boolean };

export function listTasks(userId: string, activityId: string, teamId: string) {
  if (isLocalFormalBoard()) return Promise.resolve(localListTasks(userId, activityId, teamId));
  return supabaseRestRpc<TaskRow[]>("formal_list_team_tasks_v2", { p_user_id: userId, p_activity_id: activityId, p_team_id: teamId });
}

export async function createTask(input: { userId: string; activityId: string; teamId: string; title: string; description: string; requestId: string }) {
  if (isLocalFormalBoard()) return localCreateTask(input);
  const rows = await supabaseRestRpc<TaskRow[]>("formal_create_task", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_team_id: input.teamId,
    p_title: input.title, p_description: input.description, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Task creation returned no task.");
  return rows[0];
}

export async function updateTaskStatus(input: { userId: string; activityId: string; taskId: string; status: string; expectedVersion: number; requestId: string }) {
  if (isLocalFormalBoard()) return localUpdateTaskStatus(input);
  const rows = await supabaseRestRpc<TaskRow[]>("formal_update_task_status", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_task_id: input.taskId,
    p_status: input.status, p_expected_version: input.expectedVersion, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Task update returned no task.");
  return rows[0];
}

export async function updateTaskProgress(input: { userId: string; activityId: string; taskId: string; status: string; progress: number; expectedVersion: number; requestId: string }) {
  if (isLocalFormalBoard()) return localUpdateTaskProgress(input);
  const rows = await supabaseRestRpc<TaskRow[]>("formal_update_task_progress", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_task_id: input.taskId,
    p_status: input.status, p_progress: input.progress, p_expected_version: input.expectedVersion, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Task progress update returned no task.");
  return rows[0];
}

export async function updateTaskDetails(input: { userId: string; activityId: string; taskId: string; title: string; description: string; expectedVersion: number; requestId: string }) {
  if (isLocalFormalBoard()) return localUpdateTaskDetails(input);
  const rows = await supabaseRestRpc<TaskRow[]>("formal_update_task_details", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_task_id: input.taskId, p_title: input.title, p_description: input.description,
    p_expected_version: input.expectedVersion, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Task detail update returned no task.");
  return rows[0];
}
