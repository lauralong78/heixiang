import { AuthInputError, parseCredentials, publicUser } from "@/lib/server/formal-board/auth";
import { registerWithCredentials, newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { SupabaseRestError } from "@/lib/server/formal-board/supabase-rest";

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const credentials = parseCredentials(await request.json());
    const result = await registerWithCredentials(credentials, requestId);
    return Response.json({ ok: true, data: { user: publicUser(result.user) }, requestId }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthInputError) {
      return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    }
    if (error instanceof SupabaseRestError && error.status === 409) {
      return Response.json(makeApiFailure(requestId, "CONFLICT", "账号已存在。"), { status: 409 });
    }
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "注册暂时不可用，请稍后重试。", true), { status: 503 });
  }
}
