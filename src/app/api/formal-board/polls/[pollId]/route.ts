import { makeApiFailure } from "@/lib/server/formal-board/contracts";
import { currentVoteUser, jsonBody, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { getPollSnapshot, updatePoll } from "@/lib/server/formal-board/vote-service";
import { isUuid, parsePollPatch, VoteInputError } from "@/lib/server/formal-board/vote";

type Context = { params: Promise<{ pollId: string }> };

export async function GET(request: Request, context: Context) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId } = await context.params;
    if (!isUuid(pollId)) throw new VoteInputError("投票标识无效。");
    const snapshot = await getPollSnapshot(user.user.id, pollId);
    return Response.json({ ok: true, data: { snapshot }, requestId });
  } catch (error) { return voteFailure(requestId, error); }
}

export async function PATCH(request: Request, context: Context) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const { pollId } = await context.params;
    if (!isUuid(pollId)) throw new VoteInputError("投票标识无效。");
    const body = parsePollPatch(await jsonBody(request));
    const poll = await updatePoll({ ...body, pollId, userId: user.user.id, requestId });
    return Response.json({ ok: true, data: { poll }, requestId });
  } catch (error) { return voteFailure(requestId, error); }
}
