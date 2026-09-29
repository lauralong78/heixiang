import { cookies } from "next/headers";

import { getOwnContact, setOwnContact, validateContact } from "@/lib/server/formal-board/contact";
import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";

async function currentUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function GET() {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    return Response.json({ ok: true, data: { contact: await getOwnContact(current.user.id) }, requestId });
  } catch { return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "联系方式暂时无法读取，请稍后重试。", true), { status: 503 }); }
}

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as { value?: unknown };
    const value = validateContact(body.value);
    return Response.json({ ok: true, data: { contact: await setOwnContact(current.user.id, value) }, requestId });
  } catch (error) {
    if (error instanceof Error && error.message.includes("联系方式")) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "联系方式暂时无法保存，请稍后重试。", true), { status: 503 });
  }
}
