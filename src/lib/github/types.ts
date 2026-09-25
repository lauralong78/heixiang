export type CheckStatus = "pass" | "fail" | "unknown";

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
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  license: string | null;
  updatedAt: string;
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
    | "roadmap";
  label: string;
  status: CheckStatus;
  summary: string;
  evidence: CheckEvidence[];
  suggestion: string | null;
};

export type RepositoryCheckReport = {
  repository: RepositoryMetadata;
  checkedAt: string;
  readme: {
    status: CheckStatus;
    path: string | null;
    truncated: boolean;
  };
  checks: RepositoryCheckItem[];
  totals: Record<CheckStatus, number>;
};
