import { randomUUID } from "node:crypto";

import {
  fetchPublicRepository,
  GitHubRequestError,
  parseGitHubRepositoryUrl,
} from "@/lib/github/client";
import { inspectReadme } from "@/lib/github/rules";
import type { ApiResult, RepositoryCheckReport } from "@/lib/github/types";

export const runtime = "nodejs";

function errorResponse(
  error: GitHubRequestError,
  requestId: string,
): Response {
  const result: ApiResult<never> = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
    requestId,
  };
  return Response.json(result, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const url = new URL(request.url);
    const repositoryUrl = url.searchParams.get("url") ?? "";
    const coordinates = parseGitHubRepositoryUrl(repositoryUrl);
    const result = await fetchPublicRepository(coordinates);
    const inspected = inspectReadme(result.readme, {
      path: result.readmePath,
      truncated: result.truncated,
    });
    const report: RepositoryCheckReport = {
      repository: result.repository,
      source: result.source,
      checkedAt: new Date().toISOString(),
      ...inspected,
    };
    const response: ApiResult<RepositoryCheckReport> = {
      ok: true,
      data: report,
      requestId,
    };
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof GitHubRequestError) {
      return errorResponse(error, requestId);
    }

    const fallback = new GitHubRequestError(
      "INTERNAL_ERROR",
      "检查器发生未预期错误，请稍后重试。",
      true,
      500,
    );
    return errorResponse(fallback, requestId);
  }
}
