import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";
import { createTask, listTasks, updateTaskProgress, updateTaskStatus } from "@/lib/server/formal-board/task-service";
import { parseTaskInput, TaskInputError } from "@/lib/server/formal-board/task";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

async function currentUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    const query = new URL(request.url).searchParams;
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (!query.get("activityId") || !query.get("teamId")) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "缺少活动或队伍标识。"), { status: 400 });
    const tasks = await listTasks(current.user.id, query.get("activityId")!, query.get("teamId")!);
    return Response.json({ ok: true, data: { tasks }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "任务暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const task = await createTask({ ...parseTaskInput(await request.json()), userId: current.user.id, requestId });
    return Response.json({ ok: true, data: { task }, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskInputError) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    if (error instanceof SupabaseRestError && error.status === 409) return Response.json(makeApiFailure(requestId, "CONFLICT", "任务创建冲突，请重试。"), { status: 409 });
    if (error instanceof SupabaseRestError && error.status === 400) {
      console.error("[formal-board] task create rejected", { requestId, status: error.status, details: error.details });
      return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "数据库拒绝了任务内容，请确认第 6 个迁移已成功执行，并重试。"), { status: 400 });
    }
    if (error instanceof SupabaseRestError) console.error("[formal-board] task create failed", { requestId, status: error.status, details: error.details });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "任务暂时无法创建，请保持 TUN 或代理网络开启后重试。", true), { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const ids = [body.activityId, body.taskId].map((v) => typeof v === "string" ? v : "");
    const status = typeof body.status === "string" ? body.status : "";
    const progress = typeof body.progress === "number" ? body.progress : null;
    const version = typeof body.expectedVersion === "number" ? body.expectedVersion : -1;
    if (!ids[0] || !ids[1] || !["todo", "doing", "done"].includes(status) || version < 1 || (progress !== null && (!Number.isInteger(progress) || progress < 0 || progress > 100))) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "任务状态、进度或版本无效。"), { status: 400 });
    const task = progress === null
      ? await updateTaskStatus({ userId: current.user.id, activityId: ids[0], taskId: ids[1], status, expectedVersion: version, requestId })
      : await updateTaskProgress({ userId: current.user.id, activityId: ids[0], taskId: ids[1], status, progress, expectedVersion: version, requestId });
    return Response.json({ ok: true, data: { task }, requestId });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 409) return Response.json(makeApiFailure(requestId, "CONFLICT", "任务已被其他人修改，请刷新后重试。"), { status: 409 });
    if (error instanceof SupabaseRestError) console.error("[formal-board] task update failed", { requestId, status: error.status, details: error.details });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "任务暂时无法更新，请保持 TUN 或代理网络开启后重试。", true), { status: 503 });
  }
}
