import { cookies } from "next/headers";

import { validateAttachmentInput } from "@/lib/server/formal-board/attachment";
import { listAttachments, deleteAttachment } from "@/lib/server/formal-board/attachment-service";
import { newRequestId } from "@/lib/server/formal-board/auth-service";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { FORMAL_BOARD_SESSION_COOKIE } from "@/lib/server/formal-board/session";
import { getCurrentUserFromToken } from "@/lib/server/formal-board/session-service";

async function currentUser() {
  const token = (await cookies()).get(FORMAL_BOARD_SESSION_COOKIE)?.value;
  return token ? getCurrentUserFromToken(token) : null;
}

export async function GET(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    const activityId = new URL(request.url).searchParams.get("activityId") ?? "";
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (!activityId) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "缺少活动标识。"), { status: 400 });
    return Response.json({ ok: true, data: { attachments: await listAttachments(current.user.id, activityId) }, requestId });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json(makeApiFailure(requestId, "FORBIDDEN", "你不是该活动成员，不能读取附件。"), { status: 403 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "附件列表暂时无法读取，请稍后重试。", true), { status: 503 });
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = await request.json() as { activityId?: unknown; name?: unknown; mediaType?: unknown; sizeBytes?: unknown };
    validateAttachmentInput(body);
    // The private object-storage bucket is deliberately not provisioned by this task.
    return Response.json(makeApiFailure(requestId, "STORAGE_UNAVAILABLE", "文件类型和大小校验已通过，但私有对象存储尚未获授权；未上传文件。", false), { status: 503 });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("文件") || error.message.includes("文件名"))) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", error.message), { status: 400 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "附件请求暂时失败，请稍后重试。", true), { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const requestId = newRequestId();
  try {
    const current = await currentUser();
    const query = new URL(request.url).searchParams;
    const activityId = query.get("activityId") ?? "";
    const attachmentId = query.get("attachmentId") ?? "";
    if (!current) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    if (!activityId || !attachmentId) return Response.json(makeApiFailure(requestId, "INVALID_INPUT", "缺少附件或活动标识。"), { status: 400 });
    await deleteAttachment(current.user.id, activityId, attachmentId);
    return Response.json({ ok: true, data: { deleted: true }, requestId });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json(makeApiFailure(requestId, "FORBIDDEN", "只有上传者或活动授权角色可以删除附件。"), { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json(makeApiFailure(requestId, "NOT_FOUND", "附件不存在或已删除。"), { status: 404 });
    return Response.json(makeApiFailure(requestId, "INTERNAL_ERROR", "附件删除暂时失败，请稍后重试。", true), { status: 503 });
  }
}
