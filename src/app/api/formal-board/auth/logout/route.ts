import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE, getSessionCookieOptions } from "@/lib/server/formal-board/session";
import { revokeSession } from "@/lib/server/formal-board/session-service";

export async function POST() {
  const requestId = newRequestId();
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(FORMAL_BOARD_SESSION_COOKIE)?.value;
    if (token) await revokeSession(token, requestId);
    cookieStore.set(FORMAL_BOARD_SESSION_COOKIE, "", { ...getSessionCookieOptions(), maxAge: 0 });
    return Response.json({ ok: true, data: { loggedOut: true }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "退出登录暂时失败，请稍后重试。", true), { status: 503 });
  }
}
