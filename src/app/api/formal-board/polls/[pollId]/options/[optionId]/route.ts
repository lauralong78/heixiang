import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { currentVoteUser, jsonBody, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { updatePollOption } from "@/lib/server/formal-board/vote-service";
import { isUuid, parseOptionPatch, VoteInputError } from "@/lib/server/formal-board/vote";

export async function PATCH(request: Request, context: { params: Promise<{ pollId: string; optionId: string }> }) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId, optionId } = await context.params;
    if (!isUuid(pollId) || !isUuid(optionId)) throw new VoteInputError("投票或候选项标识无效。");
    const body = parseOptionPatch(await jsonBody(request));
    const option = await updatePollOption({ ...body, pollId, optionId, userId: user.user.id, requestId, status: body.status });
    return Response.json({ ok: true, data: { option }, requestId });
  } catch (error) { return voteFailure(requestId, error); }
}
