import { cookies } from "next/headers";

import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { listVisibleAudit } from "@/lib/server/formal-board/audit-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
    const current = token ? await getCurrentUserFromToken(token) : null;
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const activityId = new URL(request.url).searchParams.get("activityId") ?? undefined;
    const events = await listVisibleAudit(current.user.id, activityId);
    return Response.json({ ok: true, data: { events }, requestId });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json(makeApiFailure(requestId, "FORBIDDEN", "只有活动协作者或主持人可以查看该活动审计。"), { status: 403 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "审计记录暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}
