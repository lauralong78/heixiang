import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { currentVoteUser, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { getPollResult } from "@/lib/server/formal-board/vote-service";
import { isUuid, VoteInputError } from "@/lib/server/formal-board/vote";

export async function GET(_request: Request, context: { params: Promise<{ pollId: string }> }) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId } = await context.params;
    if (!isUuid(pollId)) throw new VoteInputError("投票标识无效。");
    const result = await getPollResult(user.user.id, pollId);
    return Response.json({ ok: true, data: { result }, requestId });
  } catch (error) { return voteFailure(requestId, error); }
}
