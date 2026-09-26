import type {
  DocsAssistantDraft,
  GeneratedDocuments,
  ImprovementDraft,
  MissingItem,
  UrlCheck,
} from "./types";

export const DOCS_ASSISTANT_STORAGE_KEY = "hackkit:docs-assistant:v1";

export const FIELD_LIMITS = {
  short: 120,
  medium: 600,
  long: 2_400,
  url: 500,
} as const;

const EMPTY_IMPROVEMENT: ImprovementDraft = { title: "", priority: "", cost: "" };

export function createEmptyDraft(): DocsAssistantDraft {
  return {
    projectName: "",
    problem: "",
    targetUsers: "",
    coreFeatures: "",
    techStack: "",
    setupSteps: "",
    dataApiDesign: "",
    responsibility: "",
    aiUsage: "",
    challenge: "",
    risks: ["", "", ""],
    improvements: [
      { ...EMPTY_IMPROVEMENT },
      { ...EMPTY_IMPROVEMENT },
      { ...EMPTY_IMPROVEMENT },
    ],
    repositoryUrl: "",
    deploymentUrl: "",
    demoUrl: "",
  };
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function normalizeDraft(value: unknown): DocsAssistantDraft {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawRisks = Array.isArray(source.risks) ? source.risks : [];
  const rawImprovements = Array.isArray(source.improvements) ? source.improvements : [];
  const improvement = (index: number): ImprovementDraft => {
    const item = rawImprovements[index];
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      title: text(record.title, FIELD_LIMITS.medium),
      priority: text(record.priority, FIELD_LIMITS.short),
      cost: text(record.cost, FIELD_LIMITS.medium),
    };
  };

  return {
    projectName: text(source.projectName, FIELD_LIMITS.short),
    problem: text(source.problem, FIELD_LIMITS.medium),
    targetUsers: text(source.targetUsers, FIELD_LIMITS.medium),
    coreFeatures: text(source.coreFeatures, FIELD_LIMITS.long),
    techStack: text(source.techStack, FIELD_LIMITS.medium),
    setupSteps: text(source.setupSteps, FIELD_LIMITS.long),
    dataApiDesign: text(source.dataApiDesign, FIELD_LIMITS.long),
    responsibility: text(source.responsibility, FIELD_LIMITS.long),
    aiUsage: text(source.aiUsage, FIELD_LIMITS.long),
    challenge: text(source.challenge, FIELD_LIMITS.long),
    risks: [0, 1, 2].map((index) => text(rawRisks[index], FIELD_LIMITS.medium)) as DocsAssistantDraft["risks"],
    improvements: [improvement(0), improvement(1), improvement(2)],
    repositoryUrl: text(source.repositoryUrl, FIELD_LIMITS.url),
    deploymentUrl: text(source.deploymentUrl, FIELD_LIMITS.url),
    demoUrl: text(source.demoUrl, FIELD_LIMITS.url),
  };
}

export function validateUrl(value: string): UrlCheck {
  const trimmed = value.trim();
  if (!trimmed) return { status: "empty", value: "" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { status: "invalid", value: trimmed, reason: "请填写包含 http:// 或 https:// 的完整地址" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "invalid", value: trimmed, reason: `不允许 ${parsed.protocol} 协议，仅支持 http/https` };
  }

  if (!parsed.hostname) {
    return { status: "invalid", value: trimmed, reason: "链接缺少有效域名" };
  }

  return { status: "valid", value: parsed.href };
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function completeImprovement(item: ImprovementDraft) {
  return hasText(item.title) && hasText(item.priority) && hasText(item.cost);
}

export function getMissingItems(draft: DocsAssistantDraft): MissingItem[] {
  const missing: MissingItem[] = [];
  const add = (item: MissingItem) => missing.push(item);
  const links = {
    repository: validateUrl(draft.repositoryUrl),
    deployment: validateUrl(draft.deploymentUrl),
    demo: validateUrl(draft.demoUrl),
  };

  if (links.repository.status !== "valid") {
    add({ id: "repository-link", label: "仓库提交链接", detail: "补充可访问的仓库 URL。", group: "links" });
  }
  if (links.deployment.status !== "valid" && links.demo.status !== "valid") {
    add({ id: "demo-material", label: "演示材料", detail: "至少补充部署地址或演示视频/素材链接之一。", group: "demo" });
  }

  const coreFields: Array<[keyof DocsAssistantDraft, string, string]> = [
    ["projectName", "项目名", "用于 README 标题和下载文件名。"],
    ["problem", "问题定义", "用一句话说清项目解决什么问题。"],
    ["targetUsers", "目标用户", "说清谁会使用以及典型场景。"],
    ["coreFeatures", "核心功能", "每行一项，说清真实已完成的能力。"],
    ["techStack", "技术栈", "补充主要框架、语言和服务。"],
    ["setupSteps", "安装/运行步骤", "让陌生人能复现项目。"],
    ["dataApiDesign", "数据或接口设计", "说明主要数据流、端点或边界。"],
    ["challenge", "最大困难与解法", "补充真实遇到的困难和处理方式。"],
  ];
  for (const [key, label, detail] of coreFields) {
    if (!hasText(draft[key] as string)) add({ id: `readme-${key}`, label, detail, group: "readme" });
  }
  if (!hasText(draft.responsibility)) {
    add({ id: "responsibility", label: "本人负责部分", detail: "明确你亲自完成的范围。", group: "ownership" });
  }
  if (!hasText(draft.aiUsage)) {
    add({ id: "ai-usage", label: "AI 使用情况", detail: "说明是否使用 AI、用在哪里以及如何核验。", group: "ownership" });
  }
  const riskCount = draft.risks.filter(hasText).length;
  if (riskCount < 3) {
    add({ id: "risks", label: "3 个风险/边界", detail: `当前仅 ${riskCount} 个，还需 ${3 - riskCount} 个。`, group: "risks" });
  }
  const improvementCount = draft.improvements.filter(completeImprovement).length;
  if (improvementCount < 2) {
    add({ id: "improvements", label: "2–3 个后续改进", detail: `当前仅 ${improvementCount} 个完整项，每项需有优先级与代价。`, group: "roadmap" });
  }

  return missing;
}

export function escapeMarkdown(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_[\]{}()#+.!|])/g, "\\$1");
}

function cleanInline(value: string) {
  return escapeMarkdown(value.trim().replace(/\s+/g, " "));
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, ""))
    .filter(Boolean);
}

function paragraph(value: string, prompt: string) {
  return hasText(value) ? cleanInline(value) : `> [待补充：${prompt}]`;
}

function list(value: string, prompt: string) {
  const items = lines(value);
  return items.length ? items.map((item) => `- ${escapeMarkdown(item)}`).join("\n") : `- [待补充：${prompt}]`;
}

function numbered(value: string, prompt: string) {
  const items = lines(value);
  return items.length ? items.map((item, index) => `${index + 1}. ${escapeMarkdown(item)}`).join("\n") : `1. [待补充：${prompt}]`;
}

function linkLine(label: string, value: string) {
  const check = validateUrl(value);
  if (check.status === "valid") return `- ${label}：[${label}](<${check.value}>)`;
  if (check.status === "invalid") return `- ${label}：[待补充：${check.reason}]`;
  return `- ${label}：[待补充：添加 ${label} URL]`;
}

function riskList(draft: DocsAssistantDraft) {
  return draft.risks.map((risk, index) => `- ${risk.trim() ? escapeMarkdown(risk.trim()) : `[待补充：风险/边界 ${index + 1}]`}`).join("\n");
}

function improvementList(draft: DocsAssistantDraft) {
  return draft.improvements.map((item, index) => {
    if (!hasText(item.title) && !hasText(item.priority) && !hasText(item.cost)) {
      return `${index + 1}. [待补充：改进项 ${index + 1}（包含优先级与代价）]`;
    }
    const title = hasText(item.title) ? cleanInline(item.title) : "[待补充：改进内容]";
    const priority = hasText(item.priority) ? cleanInline(item.priority) : "待补充";
    const cost = hasText(item.cost) ? cleanInline(item.cost) : "待补充";
    return `${index + 1}. **${title}** — 优先级：${priority}；代价：${cost}`;
  }).join("\n");
}

function missingSection(draft: DocsAssistantDraft) {
  const missing = getMissingItems(draft);
  if (!missing.length) return "- 当前规则范围内无缺失项，仍需人工核对事实与演示可用性。";
  return missing.map((item) => `- **${item.label}**：${item.detail}`).join("\n");
}

export function generateDocuments(draft: DocsAssistantDraft): GeneratedDocuments {
  const title = hasText(draft.projectName) ? cleanInline(draft.projectName) : "[待补充：项目名]";
  const links = [
    linkLine("代码仓库", draft.repositoryUrl),
    linkLine("在线部署", draft.deploymentUrl),
    linkLine("演示材料", draft.demoUrl),
  ].join("\n");
  const missing = missingSection(draft);

  const readme = `# ${title}

## 项目简介

**我们要解决的问题：** ${paragraph(draft.problem, "用一句话说清问题")}

**目标用户：** ${paragraph(draft.targetUsers, "说明目标用户与场景")}

## 核心功能

${list(draft.coreFeatures, "每行填写一项真实功能")}

## 技术栈

${list(draft.techStack, "填写框架、语言与服务")}

## 安装与运行

${numbered(draft.setupSteps, "填写可复现的安装、配置与运行步骤")}

## 数据与接口设计

${paragraph(draft.dataApiDesign, "说明主要数据流、接口或不存在此项")}

## 本人负责部分

${paragraph(draft.responsibility, "明确你亲自完成的工作")}

## AI 使用情况

${paragraph(draft.aiUsage, "如实说明是否使用 AI、使用环节与核验方式")}

## 最大困难与解决方式

${paragraph(draft.challenge, "填写真实困难、处理方式与结果")}

## 风险与边界

${riskList(draft)}

## 后续改进

${improvementList(draft)}

## 链接

${links}

## 提交前待补清单

${missing}
`;

  const onePager = `# ${title} — 一页项目说明

## 01 / 问题与用户

${paragraph(draft.problem, "一句话问题定义")}

**为谁解决：** ${paragraph(draft.targetUsers, "目标用户与使用场景")}

## 02 / 方案与技术

**核心功能**

${list(draft.coreFeatures, "核心功能")}

**技术栈：** ${paragraph(draft.techStack, "技术栈")}

**数据/接口：** ${paragraph(draft.dataApiDesign, "数据或接口设计")}

## 03 / 交付与贡献

**本人负责：** ${paragraph(draft.responsibility, "个人贡献边界")}

**AI 使用：** ${paragraph(draft.aiUsage, "AI 使用与核验情况")}

**最大困难：** ${paragraph(draft.challenge, "困难与解法")}

## 04 / 风险与下一步

**风险/边界**

${riskList(draft)}

**后续改进**

${improvementList(draft)}

## 05 / 演示与提交

${links}

### 提交前待补

${missing}
`;

  return { readme, onePager };
}

export function safeFileStem(projectName: string) {
  const stem = projectName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50);
  return stem || "黑箱-项目";
}
