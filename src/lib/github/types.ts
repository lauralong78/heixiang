export type CheckStatus = "pass" | "fail" | "unknown";
export type CheckPriority = "high" | "medium" | "low";

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
      requestId: string;
    };

export type RepositoryMetadata = {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  language: string | null;
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  defaultBranch: string | null;
  license: string | null;
  updatedAt: string | null;
};

export type CheckEvidence = {
  line: number;
  excerpt: string;
};

export type RepositoryCheckItem = {
  id:
    | "readme"
    | "problem"
    | "features"
    | "setup"
    | "stack"
    | "challenges"
    | "demo"
    | "roadmap"
    | "risks";
  label: string;
  priority: CheckPriority;
  status: CheckStatus;
  summary: string;
  evidence: CheckEvidence[];
  suggestion: string | null;
};

export type MissingRepositoryCheck = Pick<
  RepositoryCheckItem,
  "id" | "label" | "priority" | "summary" | "suggestion" | "evidence"
>;

export type RepositoryCheckReport = {
  repository: RepositoryMetadata;
  source: "api" | "public-page";
  checkedAt: string;
  readme: {
    status: CheckStatus;
    path: string | null;
    truncated: boolean;
  };
  checks: RepositoryCheckItem[];
  missing: MissingRepositoryCheck[];
  totals: Record<CheckStatus, number>;
};
