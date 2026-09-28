import { cookies } from "next/headers";

import { publicUser } from "@/lib/server/formal-board/auth";
import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";

export async function GET() {
  const requestId = newRequestId();
  try {
    const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
    if (!token) {
      return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    }

    const current = await getCurrentUserFromToken(token);
    if (!current) {
      return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "登录已过期，请重新登录。"), { status: 401 });
    }

    return Response.json({ ok: true, data: { user: publicUser(current.user) }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "当前用户暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}
