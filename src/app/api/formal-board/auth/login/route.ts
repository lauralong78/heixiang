import { cookies } from "next/headers";

import { AuthInputError, parseCredentials, publicUser } from "@/lib/server/formal-board/auth";
import { loginWithCredentials, newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE, getSessionCookieOptions } from "@/lib/server/formal-board/session";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const credentials = parseCredentials(await request.json());
    const result = await loginWithCredentials(credentials, requestId);
    if (!result) {
      return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "账号或密码不正确。"), { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(FORMAL_BOARD_SESSION_COOKIE, result.token, getSessionCookieOptions());
    return Response.json({ ok: true, data: { user: publicUser(result.user) }, requestId });
  } catch (error) {
    if (error instanceof AuthInputError) {
      return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    }
    if (error instanceof SupabaseRestError && error.status === 429) {
      return Response.json(makeApiFailure(requestId, "RATE_LIMITED", "请求过于频繁，请稍后重试。", true), { status: 429 });
    }
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "登录暂时不可用，请稍后重试。", true), { status: 503 });
  }
}
