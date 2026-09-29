import { createPoll } from "@/lib/server/formal-board/vote-service";
import { currentVoteUser, jsonBody, requestContext, voteFailure } from "@/lib/server/formal-board/vote-api";
import { parsePollInput } from "@/lib/server/formal-board/vote";
import { makeApiFailure } from "@/lib/server/formal-board/contracts";

export async function POST(request: Request) {
  const requestId = requestContext();
  try {
    const user = await currentVoteUser();
    if (!user) return Response.json(makeApiFailure(requestId, "UNAUTHENTICATED", "请先登录。"), { status: 401 });
    const body = parsePollInput(await jsonBody(request));
    const poll = await createPoll({ ...body, userId: user.user.id, requestId });
    return Response.json({ ok: true, data: { poll }, requestId }, { status: 201 });
  } catch (error) { return voteFailure(requestId, error); }
}
