export const REPOSITORY_DRAFT_STORAGE_KEY = "blackbox.repo-check.draft.v1";
export const REPOSITORY_DRAFT_VERSION = 1;

export function normalizeRepositoryDraft(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))) return null;
  return url.toString();
}

export function serializeRepositoryDraft(value: string): string | null {
  const repositoryUrl = normalizeRepositoryDraft(value);
  return repositoryUrl ? JSON.stringify({ version: REPOSITORY_DRAFT_VERSION, repositoryUrl }) : null;
}

export function parseRepositoryDraft(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("仓库地址草稿不是有效 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("仓库地址草稿结构无效。");
  const envelope = parsed as { version?: unknown; repositoryUrl?: unknown };
  if (envelope.version !== REPOSITORY_DRAFT_VERSION || typeof envelope.repositoryUrl !== "string") throw new Error("仓库地址草稿版本无效。");
  const repositoryUrl = normalizeRepositoryDraft(envelope.repositoryUrl);
  if (!repositoryUrl) throw new Error("仓库地址草稿内容无效。");
  return repositoryUrl;
}
