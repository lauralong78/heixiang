import { cookies } from "next/headers";

import { ActivityInputError, parseActivityInput } from "@/lib/server/formal-board/activity";
import { createActivityWithDeadline, listActivities, updateActivity } from "@/lib/server/formal-board/activity-service";
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

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const activityId = typeof body.activityId === "string" ? body.activityId : "";
    const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : -1;
    const input = parseActivityInput(body);
    const status = typeof body.status === "string" ? body.status : "draft";
    if (!/^[0-9a-f-]{36}$/i.test(activityId) || expectedVersion < 1 || !["draft", "open", "paused", "closed"].includes(status)) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "活动信息或版本无效。"), { status: 400 });
    const activity = await updateActivity({ ...input, userId: current.user.id, activityId, status, expectedVersion, requestId });
    return Response.json({ ok: true, data: { activity }, requestId });
  } catch (error) {
    if (error instanceof ActivityInputError) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    if (error instanceof SupabaseRestError && error.status === 409) return Response.json(makeApiFailure(requestId, "CONFLICT", "活动已被其他人修改，请刷新后重试。"), { status: 409 });
    if (error instanceof SupabaseRestError && error.status === 403) return Response.json(makeApiFailure(requestId, "FORBIDDEN", "只有主持人可以编辑活动。"), { status: 403 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "活动暂时无法修改，请稍后重试。", true), { status: 503 });
  }
}
