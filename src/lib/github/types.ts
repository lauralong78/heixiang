export type CheckStatus = "pass" | "fail" | "unknown";
export type CheckPriority = "high" | "medium" | "low";
export type RepositoryCheckCategory =
  | "submission"
  | "collaboration"
  | "reproducibility"
  | "maintenance";

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
    | "risks"
    | "license"
    | "ci-workflow"
    | "package-manifest"
    | "test-script"
    | "build-script"
    | "archived"
    | "recent-update";
  category: RepositoryCheckCategory;
  label: string;
  priority: CheckPriority;
  status: CheckStatus;
  summary: string;
  evidence: CheckEvidence[];
  suggestion: string | null;
};

export type MissingRepositoryCheck = Pick<
  RepositoryCheckItem,
  "id" | "category" | "label" | "priority" | "summary" | "suggestion" | "evidence"
>;

export type RepositoryFacts = {
  community: {
    license: boolean | null;
  };
  reproducibility: {
    ciWorkflow: boolean | null;
    packageManifest: boolean | null;
    testScript: boolean | null;
    buildScript: boolean | null;
  };
  maintenance: {
    archived: boolean | null;
    pushedAt: string | null;
  };
};

export type RepositoryCheckGroup = {
  id: RepositoryCheckCategory;
  label: string;
  description: string;
  checks: RepositoryCheckItem[];
};

export type RepositoryCheckReport = {
  repository: RepositoryMetadata;
  facts: RepositoryFacts;
  source: "api" | "public-page";
  checkedAt: string;
  readme: {
    status: CheckStatus;
    path: string | null;
    truncated: boolean;
  };
  checks: RepositoryCheckItem[];
  groups: RepositoryCheckGroup[];
  missing: MissingRepositoryCheck[];
  totals: Record<CheckStatus, number>;
};
