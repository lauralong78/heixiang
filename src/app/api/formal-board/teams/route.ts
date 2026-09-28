import { cookies } from "next/headers";

import { isUuid, parseTeamInput, TeamInputError } from "@/lib/server/formal-board/team";
import { createTeam, listTeams } from "@/lib/server/formal-board/team-service";
import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

async function requireUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  if (!token) return null;
  return getCurrentUserFromToken(token);
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    const activityId = new URL(request.url).searchParams.get("activityId") ?? "";
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (!isUuid(activityId)) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "活动标识无效。"), { status: 400 });
    const teams = await listTeams(current.user.id, activityId);
    return Response.json({ ok: true, data: { teams }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "队伍暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const input = parseTeamInput(await request.json());
    const team = await createTeam({ ...input, userId: current.user.id, requestId });
    return Response.json({ ok: true, data: { team }, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamInputError) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    if (error instanceof SupabaseRestError && error.status === 409) return Response.json(makeApiFailure(requestId, "CONFLICT", "队伍名称已存在。"), { status: 409 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "队伍暂时无法创建，请稍后重试。", true), { status: 503 });
  }
}
