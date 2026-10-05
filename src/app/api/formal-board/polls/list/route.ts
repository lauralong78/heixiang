import { cookies } from "next/headers";

import { isUuid } from "@/lib/server/formal-board/team";
import { listPolls } from "@/lib/server/formal-board/vote-service";
import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
    const current = token ? await getCurrentUserFromToken(token) : null;
    const activityId = new URL(request.url).searchParams.get("activityId") ?? "";
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (!isUuid(activityId)) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "活动标识无效。"), { status: 400 });
    const polls = await listPolls(current.user.id, activityId);
    return Response.json({ ok: true, data: { polls }, requestId });
  } catch {
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "投票列表暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}
