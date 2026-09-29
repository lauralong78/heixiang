import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { createInvite, revokeInvite } from "@/lib/server/formal-board/invite-service";
import { isUuid } from "@/lib/server/formal-board/team";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

async function requireUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const activityId = typeof body.activityId === "string" ? body.activityId : "";
    const role = body.role === "member" ? "member" : "collaborator";
    const maxUses = typeof body.maxUses === "number" && Number.isInteger(body.maxUses) ? body.maxUses : 50;
    const expiresAt = typeof body.expiresAt === "string" && body.expiresAt.trim() ? body.expiresAt : null;
    if (!isUuid(activityId) || maxUses < 1 || maxUses > 500 || (expiresAt && Number.isNaN(Date.parse(expiresAt)))) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "邀请参数无效。"), { status: 400 });
    const result = await createInvite({ userId: current.user.id, activityId, role, expiresAt, maxUses, requestId });
    return Response.json({ ok: true, data: result, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 403) return Response.json(makeApiFailure(requestId, "FORBIDDEN", "只有主持人可以生成邀请。"), { status: 403 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "邀请暂时无法生成，请稍后重试。", true), { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await requireUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const inviteId = new URL(request.url).searchParams.get("inviteId") ?? "";
    if (!isUuid(inviteId)) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "邀请标识无效。"), { status: 400 });
    await revokeInvite({ userId: current.user.id, inviteId, requestId });
    return Response.json({ ok: true, data: { revoked: true }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "FORBIDDEN", "邀请不存在或已被撤销。"), { status: 403 });
  }
}
