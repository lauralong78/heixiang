import "server-only";

import type { RepositoryMetadata } from "./types";

const GITHUB_API_ORIGIN = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_README_BYTES = 300_000;

export type RepositoryCoordinates = { owner: string; repo: string };

export class GitHubRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function parseGitHubRepositoryUrl(input: string): RepositoryCoordinates {
  if (input.length > 300) {
    throw new GitHubRequestError(
      "INVALID_GITHUB_URL",
      "GitHub 仓库 URL 过长。",
      false,
      400,
    );
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new GitHubRequestError(
      "INVALID_GITHUB_URL",
      "请输入完整的 GitHub 仓库 URL，例如 https://github.com/owner/repo。",
      false,
      400,
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const hasUnexpectedParts =
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    segments.length !== 2;

  if (hasUnexpectedParts) {
    throw new GitHubRequestError(
      "INVALID_GITHUB_URL",
      "只接受 https://github.com/owner/repo 格式的公开仓库 URL。",
      false,
      400,
    );
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  const validPart = /^[A-Za-z0-9_.-]+$/;
  if (!owner || !repo || !validPart.test(owner) || !validPart.test(repo)) {
    throw new GitHubRequestError(
      "INVALID_GITHUB_URL",
      "仓库 owner 或 repo 名称无效。",
      false,
      400,
    );
  }

  return { owner, repo };
}

function githubHeaders(accept: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "HackKit-Repository-Checker",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubFetch(path: string, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_ORIGIN}${path}`, {
      headers: githubHeaders(accept),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    throw new GitHubRequestError(
      isTimeout ? "GITHUB_TIMEOUT" : "GITHUB_UNAVAILABLE",
      isTimeout ? "GitHub API 请求超时，请稍后重试。" : "暂时无法连接 GitHub API，请稍后重试。",
      true,
      503,
    );
  }

  if (response.ok) return response;

  const remaining = response.headers.get("x-ratelimit-remaining");
  if (
    response.status === 429 ||
    (response.status === 403 && (remaining === "0" || response.headers.has("retry-after")))
  ) {
    throw new GitHubRequestError(
      "GITHUB_RATE_LIMITED",
      "GitHub API 请求额度已用尽，请在额度恢复后重试。",
      true,
      429,
    );
  }
  if (response.status === 404) {
    throw new GitHubRequestError(
      "REPOSITORY_NOT_FOUND",
      "仓库不存在、不是公开仓库，或当前无法访问。",
      false,
      404,
    );
  }
  if (response.status >= 500) {
    throw new GitHubRequestError(
      "GITHUB_UPSTREAM_ERROR",
      "GitHub API 当前异常，请稍后重试。",
      true,
      502,
    );
  }
  throw new GitHubRequestError(
    "GITHUB_REQUEST_FAILED",
    `GitHub API 拒绝了请求（HTTP ${response.status}）。`,
    response.status === 403,
    502,
  );
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: "", truncated: false };

  const declaredLength = Number(response.headers.get("content-length"));
  let truncated = Number.isFinite(declaredLength) && declaredLength > maxBytes;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let consumed = 0;
  let text = "";

  try {
    while (consumed < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - consumed;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      consumed += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });

      if (value.byteLength > remaining) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }

    if (consumed >= maxBytes && !truncated) {
      const probe = await reader.read();
      if (!probe.done) {
        truncated = true;
        await reader.cancel();
      }
    }

    text += decoder.decode();
    return { text, truncated };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

type GitHubRepositoryResponse = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  license: { spdx_id: string | null; name: string } | null;
  updated_at: string;
  private: boolean;
};

export async function fetchPublicRepository(coordinates: RepositoryCoordinates) {
  const { owner, repo } = coordinates;
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  const repositoryResponse = await githubFetch(
    `/repos/${safeOwner}/${safeRepo}`,
    "application/vnd.github+json",
  );
  const value = (await repositoryResponse.json()) as GitHubRepositoryResponse;

  if (value.private) {
    throw new GitHubRequestError(
      "PRIVATE_REPOSITORY",
      "检查器只支持公开仓库，不会读取私有仓库。",
      false,
      404,
    );
  }

  const repository: RepositoryMetadata = {
    name: value.name,
    fullName: value.full_name,
    description: value.description,
    url: value.html_url,
    homepage: value.homepage || null,
    language: value.language,
    stars: value.stargazers_count,
    forks: value.forks_count,
    openIssues: value.open_issues_count,
    defaultBranch: value.default_branch,
    license: value.license?.spdx_id || value.license?.name || null,
    updatedAt: value.updated_at,
  };

  const readmeResponse = await fetch(
    `${GITHUB_API_ORIGIN}/repos/${safeOwner}/${safeRepo}/readme`,
    {
      headers: githubHeaders("application/vnd.github.raw+json"),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    },
  ).catch((error: unknown) => {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    throw new GitHubRequestError(
      isTimeout ? "GITHUB_TIMEOUT" : "GITHUB_UNAVAILABLE",
      isTimeout ? "GitHub README 请求超时，请稍后重试。" : "暂时无法读取 GitHub README。",
      true,
      503,
    );
  });

  if (readmeResponse.status === 404) {
    return { repository, readme: null, readmePath: null, truncated: false };
  }
  if (!readmeResponse.ok) {
    const remaining = readmeResponse.headers.get("x-ratelimit-remaining");
    if (
      readmeResponse.status === 429 ||
      (readmeResponse.status === 403 &&
        (remaining === "0" || readmeResponse.headers.has("retry-after")))
    ) {
      throw new GitHubRequestError(
        "GITHUB_RATE_LIMITED",
        "GitHub API 请求额度已用尽，请在额度恢复后重试。",
        true,
        429,
      );
    }
    throw new GitHubRequestError(
      readmeResponse.status >= 500 ? "GITHUB_UPSTREAM_ERROR" : "README_UNAVAILABLE",
      "仓库可访问，但 GitHub 暂时无法提供 README。",
      true,
      readmeResponse.status >= 500 ? 502 : 503,
    );
  }

  let boundedReadme: { text: string; truncated: boolean };
  try {
    boundedReadme = await readBoundedResponseText(readmeResponse, MAX_README_BYTES);
  } catch {
    throw new GitHubRequestError(
      "README_UNAVAILABLE",
      "仓库可访问，但 GitHub 暂时无法读取 README 内容。",
      true,
      503,
    );
  }
  const { text: readme, truncated } = boundedReadme;
  const contentDisposition = readmeResponse.headers.get("content-disposition") ?? "";
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

  return {
    repository,
    readme,
    readmePath: filenameMatch?.[1] ?? "README",
    truncated,
  };
}
