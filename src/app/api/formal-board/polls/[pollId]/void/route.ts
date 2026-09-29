import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { voidVote } from "@/lib/server/formal-board/vote-service";
import { currentVoteUser, jsonBody, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { isUuid, parseVoidInput, VoteInputError } from "@/lib/server/formal-board/vote";

export async function POST(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId } = await context.params;
    if (!isUuid(pollId)) throw new VoteInputError("投票标识无效。");
    const body = parseVoidInput(await jsonBody(request));
    const result = await voidVote({ ...body, pollId, userId: user.user.id, requestId });
    return Response.json({ ok: true, data: result, requestId });
  } catch (error) { return voteFailure(requestId, error); }
}
