import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  fetchPublicRepository,
  parseGitHubRepositoryUrl,
} from "./client";
import { inspectReadme } from "./rules";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("accepts only canonical public GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/octocat/Hello-World"), {
    owner: "octocat",
    repo: "Hello-World",
  });
  assert.deepEqual(parseGitHubRepositoryUrl("https://github.com/octocat/Hello-World.git"), {
    owner: "octocat",
    repo: "Hello-World",
  });
  assert.throws(() => parseGitHubRepositoryUrl("https://evil.example/octocat/Hello-World"), {
    code: "INVALID_GITHUB_URL",
  });
  assert.throws(() => parseGitHubRepositoryUrl("https://github.com/octocat/Hello-World?token=secret"), {
    code: "INVALID_GITHUB_URL",
  });
});

test("reports prioritized missing requirements and count-based evidence", () => {
  const report = inspectReadme(
    "# Demo\n\n## Features\n- feature\n\n## Risks\n- privacy boundary\n",
    { path: "README.md", truncated: false },
  );

  const missingIds = report.missing.map((item) => item.id);
  assert.ok(missingIds.includes("problem"));
  assert.ok(missingIds.includes("roadmap"));
  assert.ok(missingIds.includes("risks"));
  assert.equal(report.checks.find((item) => item.id === "risks")?.status, "fail");
  assert.equal(report.checks.find((item) => item.id === "problem")?.priority, "high");
  assert.match(report.missing.find((item) => item.id === "problem")?.suggestion ?? "", /目标用户/);
});

test("keeps README-dependent rules unknown when README is unavailable", () => {
  const report = inspectReadme(null, { path: null, truncated: false });

  assert.equal(report.readme.status, "fail");
  assert.equal(report.checks.find((item) => item.id === "setup")?.status, "unknown");
  assert.equal(report.missing.some((item) => item.id === "setup"), false);
  assert.equal(report.totals.unknown, 8);
});

test("groups public repository facts without treating unknown metadata as missing", () => {
  const report = inspectReadme(
    "# Demo\n\n## Features\n- feature\n\n## Setup\n- npm test\n",
    { path: "README.md", truncated: false },
    {
      community: {
        license: true,
        contributing: false,
        codeOfConduct: null,
        securityPolicy: null,
        issueTemplate: false,
        pullRequestTemplate: null,
      },
      reproducibility: {
        ciWorkflow: true,
        packageManifest: true,
        lockfile: false,
        testScript: true,
        lintScript: null,
        buildScript: false,
        codeowners: null,
        changelog: false,
      },
      maintenance: {
        archived: false,
        pushedAt: null,
        hasRelease: true,
        latestRelease: "v1.0.0",
      },
    },
  );

  assert.deepEqual(report.groups.map((group) => group.id), [
    "submission",
    "collaboration",
    "reproducibility",
    "maintenance",
  ]);
  assert.equal(report.checks.find((item) => item.id === "license")?.status, "pass");
  assert.equal(report.checks.find((item) => item.id === "contributing")?.status, "fail");
  assert.equal(report.checks.find((item) => item.id === "code-of-conduct")?.status, "unknown");
  assert.equal(report.missing.some((item) => item.id === "code-of-conduct"), false);
});

test("requires at least three distinct risk or boundary lines", () => {
  const report = inspectReadme(
    "## Risks\n- security boundary\n- privacy limitation\n- known issue\n",
    { path: "README.md", truncated: false },
  );

  assert.equal(report.checks.find((item) => item.id === "risks")?.status, "pass");
  assert.equal(report.missing.some((item) => item.id === "risks"), false);
});

test("reads README with a real byte ceiling instead of unbounded response.text", async () => {
  const readme = "😀".repeat(200_000);
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/readme")) return new Response(readme, { status: 200 });
    return new Response(
      JSON.stringify({
        name: "Hello-World",
        full_name: "octocat/Hello-World",
        description: "A test repository",
        html_url: "https://github.com/octocat/Hello-World",
        homepage: null,
        language: "TypeScript",
        stargazers_count: 1,
        forks_count: 0,
        open_issues_count: 0,
        default_branch: "main",
        license: null,
        updated_at: "2026-09-25T00:00:00Z",
        private: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await fetchPublicRepository({ owner: "octocat", repo: "Hello-World" });
  assert.equal(result.truncated, true);
  assert.ok(new TextEncoder().encode(result.readme ?? "").byteLength <= 300_000);
});

test("collects collaboration, reproducibility, and maintenance facts from public metadata", async () => {
  const responses: Record<string, unknown> = {
    "/community/profile": {
      files: {
        license: { name: "MIT" },
        contributing: { html_url: "https://github.com/example/demo/blob/main/CONTRIBUTING.md" },
        code_of_conduct_file: null,
        security_policy: { html_url: "https://github.com/example/demo/security/policy" },
        issue_template: { config: true },
        pull_request_template: { blob_url: "https://github.com/example/demo/blob/main/.github/PULL_REQUEST_TEMPLATE.md" },
      },
    },
    "/contents": [
      { name: "package.json", type: "file" },
      { name: "package-lock.json", type: "file" },
      { name: "CHANGELOG.md", type: "file" },
      { name: "CODEOWNERS", type: "file" },
    ],
    "/contents/.github/workflows": [{ name: "ci.yml", type: "file" }],
    "/contents/package.json": { scripts: { test: "node --test", lint: "eslint .", build: "next build" } },
    "/releases/latest": { tag_name: "v1.0.0", name: "First release" },
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/repos/example/demo") {
      return new Response(JSON.stringify({
        name: "demo",
        full_name: "example/demo",
        description: "A test repository",
        html_url: "https://github.com/example/demo",
        homepage: null,
        language: "TypeScript",
        stargazers_count: 3,
        forks_count: 1,
        open_issues_count: 0,
        default_branch: "main",
        license: { spdx_id: "MIT", name: "MIT License" },
        updated_at: "2026-09-25T00:00:00Z",
        pushed_at: "2026-09-25T00:00:00Z",
        archived: false,
        private: false,
      }), { status: 200 });
    }
    if (url.pathname.endsWith("/readme")) {
      return new Response("# Demo\n\n## Features\n- feature", { status: 200 });
    }
    if (url.pathname.endsWith("/releases/latest")) {
      return new Response(JSON.stringify(responses["/releases/latest"]), { status: 200 });
    }
    if (url.pathname.endsWith("/releases")) return new Response("[]", { status: 200 });
    const key = url.pathname.replace("/repos/example/demo", "") || "/";
    const body = responses[key];
    if (body === undefined) return new Response("not found", { status: 404 });
    const accept = String(init?.headers instanceof Headers ? init.headers.get("Accept") : "");
    return new Response(typeof body === "string" || accept.includes("raw") ? JSON.stringify(body) : JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  const result = await fetchPublicRepository({ owner: "example", repo: "demo" });
  assert.equal(result.facts.community.license, true);
  assert.equal(result.facts.community.contributing, true);
  assert.equal(result.facts.community.codeOfConduct, false);
  assert.equal(result.facts.reproducibility.ciWorkflow, true);
  assert.equal(result.facts.reproducibility.lockfile, true);
  assert.equal(result.facts.reproducibility.testScript, true);
  assert.equal(result.facts.reproducibility.lintScript, true);
  assert.equal(result.facts.reproducibility.buildScript, true);
  assert.equal(result.facts.maintenance.archived, false);
  assert.equal(result.facts.maintenance.hasRelease, true);
  assert.equal(result.facts.maintenance.latestRelease, "v1.0.0");
});

test("falls back to a validated public GitHub page when the anonymous API is rate limited", async () => {
  const embeddedData = {
    payload: {
      codeViewLayoutRoute: {
        repo: { public: true, private: false, defaultBranch: "main" },
      },
      codeViewRepoRoute: {
        overview: {
          overviewFiles: [
            {
              preferredFileType: "readme",
              path: "README.md",
              richText: "<article><h1>Demo</h1><p>Features &amp; setup</p><pre>npm run dev</pre></article>",
            },
          ],
        },
      },
    },
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) {
      return new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    }
    if (url === "https://github.com/octocat/Hello-World") {
      return new Response(
        `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(embeddedData)}</script>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  const result = await fetchPublicRepository({ owner: "octocat", repo: "Hello-World" });
  assert.equal(result.source, "public-page");
  assert.equal(result.repository.defaultBranch, "main");
  assert.equal(result.repository.stars, null);
  assert.equal(result.readmePath, "README.md");
  assert.match(result.readme ?? "", /npm run dev/);
});
