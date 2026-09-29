import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { InviteInputError, parseInviteToken } from "@/lib/server/formal-board/invite";
import { joinInvite } from "@/lib/server/formal-board/invite-service";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
    const current = token ? await getCurrentUserFromToken(token) : null;
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录，再使用邀请加入活动。"), { status: 401 });
    const body = await request.json() as { token?: unknown };
    const inviteToken = parseInviteToken(body.token);
    const rows = await joinInvite({ userId: current.user.id, token: inviteToken, requestId });
    const joined = rows[0];
    if (!joined) throw new Error("Invite join returned no membership.");
    return Response.json({ ok: true, data: { ...joined }, requestId });
  } catch (error) {
    if (error instanceof InviteInputError) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    if (error instanceof SupabaseRestError) return Response.json(makeApiFailure(requestId, "CONFLICT", "邀请无效、已过期、已撤销或已达到使用次数。"), { status: 409 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "加入活动失败，请稍后重试。", true), { status: 503 });
  }
}
