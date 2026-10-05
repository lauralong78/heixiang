import { cookies } from "next/headers";

import { newRequestId } from "./auth-service";
import { makeApiFailure } from "./contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "./session";
import { getCurrentUserFromToken } from "./session-service";
import { SupabaseRestError } from "./supabase-rest";
import { VoteInputError } from "./vote";

export async function currentVoteUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function jsonBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new VoteInputError("请求体不是有效 JSON。"); }
}

export function voteFailure(requestId: string, error: unknown) {
  if (error instanceof VoteInputError) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
  if (error instanceof SupabaseRestError) {
    const detail = `${error.message} ${error.details}`.toLowerCase();
    if (error.status === 403 || detail.includes("forbidden") || detail.includes("42501")) return Response.json(makeApiFailure(requestId, "FORBIDDEN", "当前账号无权执行此投票操作。"), { status: 403 });
    if (error.status === 409 || detail.includes("conflict") || detail.includes("idempotency key reused") || detail.includes("23505") || detail.includes("40001")) return Response.json(makeApiFailure(requestId, detail.includes("idempotency") ? "IDEMPOTENCY_KEY_REUSED" : "CONFLICT", detail.includes("idempotency") ? "同一 operationId 不能复用不同参数。" : detail.includes("活动尚未开放") || detail.includes("activity is not open") ? "活动尚未开放，请先在正式进度看板开放活动。" : detail.includes("投票当前不可用") ? "活动或投票尚未开放，请先开放活动后再投票。" : "投票数据已变化或存在冲突，请刷新后重试。"), { status: 409 });
    if (detail.includes("not found") || detail.includes("unavailable")) return Response.json(makeApiFailure(requestId, "NOT_FOUND", "投票或候选项不存在。"), { status: 404 });
    if (detail.includes("locked") || detail.includes("frozen") || detail.includes("not open")) return Response.json(makeApiFailure(requestId, "CONFLICT", "投票当前状态不允许此操作。"), { status: 409 });
  }
  return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "投票服务暂时不可用，请稍后重试。", true), { status: 503 });
}

export function requestContext() { return newRequestId(); }
