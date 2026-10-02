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
