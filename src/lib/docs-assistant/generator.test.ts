import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmptyDraft,
  escapeMarkdown,
  generateDocuments,
  getMissingItems,
  normalizeDraft,
  safeFileStem,
  validateUrl,
} from "./generator";

test("generates two complete document structures from supplied facts", () => {
  const draft = createEmptyDraft();
  Object.assign(draft, {
    projectName: "Signal Kit",
    problem: "黑客松参赛者很难快速整理提交材料。",
    targetUsers: "需要在截止前交付的参赛团队。",
    coreFeatures: "生成 README\n生成一页说明",
    techStack: "Next.js\nTypeScript",
    setupSteps: "npm install\nnpm run dev",
    dataApiDesign: "数据只保存在浏览器。",
    responsibility: "我完成生成器与测试。",
    aiUsage: "未使用 AI 生成事实。",
    challenge: "防止缺失信息被伪造；使用显式占位。",
    repositoryUrl: "https://github.com/example/signal-kit",
    deploymentUrl: "https://example.com/demo",
  });
  draft.risks = ["仅本地保存", "需人工核验", "不检查远程链接"];
  draft.improvements = [
    { title: "增加导入", priority: "P1", cost: "1 天" },
    { title: "增加主题", priority: "P2", cost: "半天" },
    { title: "", priority: "", cost: "" },
  ];

  const result = generateDocuments(draft);
  assert.match(result.readme, /^# Signal Kit/m);
  assert.match(result.readme, /## 安装与运行/);
  assert.match(result.onePager, /## 05 \/ 演示与提交/);
  assert.match(result.readme, /github\.com\/example\/signal-kit/);
  assert.equal(getMissingItems(draft).some((item) => item.id === "risks"), false);
  assert.equal(getMissingItems(draft).some((item) => item.id === "improvements"), false);
});

test("escapes markdown facts and never turns dangerous protocols into links", () => {
  const draft = createEmptyDraft();
  draft.projectName = "# [Injected](javascript:alert(1))";
  draft.problem = "**not bold** <script>alert(1)</script>";
  draft.repositoryUrl = "javascript:alert(document.cookie)";

  const result = generateDocuments(draft);
  assert.ok(result.readme.includes("\\# \\[Injected\\]\\(javascript:alert\\(1\\)\\)"));
  assert.match(result.readme, /\\\*\\\*not bold\\\*\\\*/);
  assert.doesNotMatch(result.readme, /\]\(<javascript:/);
  assert.match(result.readme, /仅支持 http\/https/);
  assert.equal(validateUrl("data:text/html,boom").status, "invalid");
  assert.equal(validateUrl("https://example.com/demo").status, "valid");
  assert.equal(escapeMarkdown("a|b"), "a\\|b");
});

test("missing checklist covers required submission facts", () => {
  const ids = new Set(getMissingItems(createEmptyDraft()).map((item) => item.id));
  for (const id of [
    "repository-link",
    "demo-material",
    "readme-problem",
    "readme-coreFeatures",
    "readme-setupSteps",
    "responsibility",
    "ai-usage",
    "risks",
    "improvements",
  ]) assert.ok(ids.has(id), `missing ${id}`);
});

test("normalizes restored drafts and enforces input ceilings", () => {
  const normalized = normalizeDraft({
    projectName: "x".repeat(500),
    risks: [42, "safe"],
    improvements: [{ title: "a".repeat(900), priority: "P1", cost: "small" }],
  });
  assert.equal(normalized.projectName.length, 120);
  assert.deepEqual(normalized.risks, ["", "safe", ""]);
  assert.equal(normalized.improvements[0].title.length, 600);
  assert.equal(safeFileStem("bad/name:* demo"), "bad-name-demo");
});
