import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { castVote } from "@/lib/server/formal-board/vote-service";
import { currentVoteUser, jsonBody, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { isUuid, parseVoteInput, VoteInputError } from "@/lib/server/formal-board/vote";

export async function POST(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId } = await context.params;
    if (!isUuid(pollId)) throw new VoteInputError("投票标识无效。");
    const body = parseVoteInput(await jsonBody(request));
    const result = await castVote({ ...body, pollId, userId: user.user.id, requestId });
    return Response.json({ ok: true, data: result, requestId }, { status: result.code === "ALREADY_VOTED" ? 200 : 201 });
  } catch (error) { return voteFailure(requestId, error); }
}
