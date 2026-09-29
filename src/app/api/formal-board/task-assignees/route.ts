import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { isUuid } from "@/lib/server/formal-board/team";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";
import { supabaseRestRpc } from "@/lib/server/formal-board/supabase-rest";

async function currentUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    const query = new URL(request.url).searchParams;
    const activityId = query.get("activityId") ?? "";
    const teamId = query.get("teamId") ?? "";
    const taskId = query.get("taskId") ?? "";
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (![activityId, teamId, taskId].every(isUuid)) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "活动、队伍或任务标识无效。"), { status: 400 });
    const [members, assignees] = await Promise.all([
      supabaseRestRpc<Array<{ membership_id: string; user_id: string; display_name: string; role: string }>>("formal_list_team_members", { p_user_id: current.user.id, p_activity_id: activityId, p_team_id: teamId }),
      supabaseRestRpc<Array<{ membership_id: string }>>("formal_list_task_assignees", { p_user_id: current.user.id, p_activity_id: activityId, p_team_id: teamId, p_task_id: taskId }),
    ]);
    return Response.json({ ok: true, data: { members, membershipIds: assignees.map((item) => item.membership_id) }, requestId });
  } catch { return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "队伍成员暂时无法读取，请稍后重试。", true), { status: 503 }); }
}

export async function PUT(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const activityId = typeof body.activityId === "string" ? body.activityId : "";
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const membershipIds = Array.isArray(body.membershipIds) ? body.membershipIds.filter((item): item is string => typeof item === "string") : [];
    if (![activityId, taskId].every(isUuid) || membershipIds.some((item) => !isUuid(item))) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "任务或成员标识无效。"), { status: 400 });
    await supabaseRestRpc("formal_assign_task_members", { p_user_id: current.user.id, p_activity_id: activityId, p_task_id: taskId, p_membership_ids: membershipIds, p_request_id: requestId });
    return Response.json({ ok: true, data: { assigned: membershipIds.length }, requestId });
  } catch { return Response.json(makeApiFailure(requestId, "FORBIDDEN", "只有队长可以分配任务，或成员不属于当前队伍。"), { status: 403 }); }
}
