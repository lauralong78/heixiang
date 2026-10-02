import { randomUUID } from "node:crypto";

import {
  fetchPublicRepository,
  GitHubRequestError,
  parseGitHubRepositoryUrl,
} from "@/lib/github/client";
import { inspectReadme } from "@/lib/github/rules";
import type { ApiResult, RepositoryCheckReport } from "@/lib/github/types";

export const runtime = "nodejs";

/**
 * GET /api/github/check?url=https%3A%2F%2Fgithub.com%2Fowner%2Frepo
 *
 * Returns the shared ApiResult contract. GITHUB_TOKEN is optional and is read
 * only on the server to raise GitHub API limits; it is never accepted from the
 * browser. Deployments need outbound HTTPS access to api.github.com and, only
 * for the documented rate-limit fallback, github.com.
 */

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
    }, result.facts);
    const report: RepositoryCheckReport = {
      repository: result.repository,
      facts: result.facts,
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
