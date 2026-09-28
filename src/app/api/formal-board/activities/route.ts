import { cookies } from "next/headers";

import { ActivityInputError, parseActivityInput } from "@/lib/server/formal-board/activity";
import { createActivityWithDeadline, listActivities } from "@/lib/server/formal-board/activity-service";
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

export async function GET() {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const activities = await listActivities(current.user.id);
    return Response.json({ ok: true, data: { activities }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "活动暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const input = parseActivityInput(await request.json());
    const activity = await createActivityWithDeadline({ ...input, userId: current.user.id, requestId });
    return Response.json({ ok: true, data: { activity }, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof ActivityInputError) {
      return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    }
    if (error instanceof SupabaseRestError && error.status === 409) {
      return Response.json(makeApiFailure(requestId, "CONFLICT", "活动创建冲突，请重试。"), { status: 409 });
    }
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "活动暂时无法创建，请稍后重试。", true), { status: 503 });
  }
}
