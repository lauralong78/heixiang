import "server-only";

import type { RepositoryMetadata } from "./types";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_WEB_ORIGIN = "https://github.com";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_README_BYTES = 300_000;
const MAX_PUBLIC_PAGE_BYTES = 600_000;

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

// Optional GITHUB_TOKEN is intentionally server-only: it is never read from a
// query, request header, client bundle, or response body.
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

type PublicPageRepositoryData = {
  defaultBranch: string | null;
  readme: string | null;
  readmePath: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function decodeHtmlEntities(value: string): string {
  const decodeCodePoint = (raw: string, radix: number) => {
    const codePoint = Number.parseInt(raw, radix);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : "";
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => decodeCodePoint(hex, 16))
    .replace(/&#(\d+);/g, (_, decimal: string) => decodeCodePoint(decimal, 10))
    .replace(/&(amp|lt|gt|quot|apos);/gi, (_, name: string) => {
      const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      return entities[name.toLowerCase()] ?? "";
    });
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\/?(?:article|div|p|pre|h[1-6]|li|br|tr|section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractPublicPageRepositoryData(page: string): PublicPageRepositoryData {
  const match = page.match(
    /<script\s+type="application\/json"\s+data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/i,
  );
  if (!match) {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且公开仓库页面没有提供可验证的检查数据。",
      true,
      503,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且公开仓库页面数据格式无法验证。",
      true,
      503,
    );
  }

  const payload = asRecord(data)?.payload;
  const layoutRoute = asRecord(asRecord(payload)?.codeViewLayoutRoute);
  const repo = asRecord(layoutRoute?.repo);
  if (!repo || repo.public !== true || repo.private !== false) {
    throw new GitHubRequestError(
      "REPOSITORY_NOT_FOUND",
      "仓库不存在、不是公开仓库，或当前无法访问。",
      false,
      404,
    );
  }

  const repoRoute = asRecord(asRecord(payload)?.codeViewRepoRoute);
  const overview = asRecord(repoRoute?.overview);
  const overviewFiles = Array.isArray(overview?.overviewFiles) ? overview.overviewFiles : [];
  const readme = overviewFiles
    .map(asRecord)
    .find((file) => file?.preferredFileType === "readme" && typeof file.richText === "string");

  return {
    defaultBranch: typeof repo.defaultBranch === "string" ? repo.defaultBranch : null,
    readme: readme && typeof readme.richText === "string" ? htmlToPlainText(readme.richText) : null,
    readmePath: readme && typeof readme.path === "string" ? readme.path : null,
  };
}

async function fetchPublicRepositoryFromPage(
  coordinates: RepositoryCoordinates,
): Promise<{
  repository: RepositoryMetadata;
  readme: string | null;
  readmePath: string | null;
  truncated: boolean;
  source: "public-page";
}> {
  const { owner, repo } = coordinates;
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  let response: Response;
  try {
    response = await fetch(`${GITHUB_WEB_ORIGIN}/${safeOwner}/${safeRepo}`, {
      headers: { Accept: "text/html", "User-Agent": "HackKit-Repository-Checker" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且暂时无法读取公开仓库页面。",
      true,
      503,
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
  if (!response.ok) {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且公开仓库页面暂时无法读取。",
      true,
      503,
    );
  }

  let page: { text: string; truncated: boolean };
  try {
    page = await readBoundedResponseText(response, MAX_PUBLIC_PAGE_BYTES);
  } catch {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且公开仓库页面读取失败。",
      true,
      503,
    );
  }
  if (page.truncated) {
    throw new GitHubRequestError(
      "GITHUB_PUBLIC_PAGE_UNAVAILABLE",
      "GitHub API 被限流，且公开仓库页面过大，无法安全完成检查。",
      true,
      503,
    );
  }

  const publicData = extractPublicPageRepositoryData(page.text);
  return {
    repository: {
      name: repo,
      fullName: `${owner}/${repo}`,
      description: null,
      url: `${GITHUB_WEB_ORIGIN}/${safeOwner}/${safeRepo}`,
      homepage: null,
      language: null,
      stars: null,
      forks: null,
      openIssues: null,
      defaultBranch: publicData.defaultBranch,
      license: null,
      updatedAt: null,
    },
    readme: publicData.readme,
    readmePath: publicData.readmePath,
    truncated: false,
    source: "public-page",
  };
}

async function fetchPublicRepositoryFromApi(coordinates: RepositoryCoordinates) {
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
    return { repository, readme: null, readmePath: null, truncated: false, source: "api" as const };
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
    source: "api" as const,
  };
}

export async function fetchPublicRepository(coordinates: RepositoryCoordinates) {
  try {
    return await fetchPublicRepositoryFromApi(coordinates);
  } catch (error) {
    if (error instanceof GitHubRequestError && error.code === "GITHUB_RATE_LIMITED") {
      return fetchPublicRepositoryFromPage(coordinates);
    }
    throw error;
  }
}
