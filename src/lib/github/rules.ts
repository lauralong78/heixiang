import type {
  CheckPriority,
  CheckEvidence,
  RepositoryFacts,
  RepositoryCheckItem,
  RepositoryCheckReport,
} from "./types";

const MAX_EVIDENCE = 3;

type Rule = {
  id: Exclude<RepositoryCheckItem["id"], "readme">;
  category: "submission";
  label: string;
  priority: CheckPriority;
  minimumEvidence?: number;
  patterns: RegExp[];
  passSummary: string;
  failSummary: string;
  suggestion: string;
};

const rules: Rule[] = [
  {
    id: "problem",
    category: "submission",
    label: "问题与目标用户",
    priority: "high",
    patterns: [
      /(?:problem|motivation|why|pain point|target user|user story|background)/i,
      /(?:问题|痛点|背景|动机|目标用户|适用人群|用户故事|为谁)/,
    ],
    passSummary: "README 中找到问题背景或目标用户的明确表述。",
    failSummary: "README 中未找到问题背景或目标用户的明确表述。",
    suggestion: "增加“问题与目标用户”小节：谁遇到了什么问题，以及为什么值得解决。",
  },
  {
    id: "features",
    category: "submission",
    label: "核心功能",
    priority: "high",
    patterns: [
      /(?:features?|capabilit(?:y|ies)|what it does|highlights?)/i,
      /(?:核心功能|主要功能|功能介绍|产品能力|亮点)/,
    ],
    passSummary: "README 中找到核心功能说明。",
    failSummary: "README 中未找到核心功能说明。",
    suggestion: "用 3–5 条可验证的要点列出当前已经实现的核心功能。",
  },
  {
    id: "setup",
    category: "submission",
    label: "运行方式",
    priority: "high",
    patterns: [
      /(?:install(?:ation)?|getting started|quick ?start|usage|run locally|prerequisites?)/i,
      /(?:安装|快速开始|开始使用|本地运行|运行方式|使用方法|环境要求)/,
      /(?:npm|pnpm|yarn|bun)\s+(?:install|run|dev|start|build)/i,
    ],
    passSummary: "README 中找到安装、启动或使用命令。",
    failSummary: "README 中未找到可复现的安装或运行方式。",
    suggestion: "增加“本地运行”小节，写明环境要求、安装命令和启动命令。",
  },
  {
    id: "stack",
    category: "submission",
    label: "技术栈",
    priority: "medium",
    patterns: [
      /(?:tech(?:nology)? stack|built with|architecture|dependencies)/i,
      /(?:技术栈|技术选型|系统架构|主要依赖|使用技术)/,
      /(?:next\.js|react|vue|svelte|angular|typescript|python|django|flask|fastapi|node\.js|express|spring boot|flutter|tailwind)/i,
    ],
    passSummary: "README 中找到技术栈或架构说明。",
    failSummary: "README 中未找到技术栈或架构说明。",
    suggestion: "增加“技术栈”小节，列出前端、后端、数据与部署方案。",
  },
  {
    id: "challenges",
    category: "submission",
    label: "问题与困难",
    priority: "medium",
    patterns: [
      /(?:challenges?|difficult(?:y|ies)|limitations?|known issues?|trade-?offs?|lessons? learned)/i,
      /(?:困难|挑战|已知问题|局限|限制|取舍|踩坑|经验教训)/,
    ],
    passSummary: "README 中找到困难、限制或已知问题说明。",
    failSummary: "README 中未找到困难、限制或已知问题说明。",
    suggestion: "如实记录一个技术难点、当前限制及你的解决或取舍。",
  },
  {
    id: "demo",
    category: "submission",
    label: "演示或部署",
    priority: "medium",
    patterns: [
      /(?:live demo|demo video|deployment|deployed|preview|try it|screenshots?)/i,
      /(?:在线演示|演示视频|部署地址|访问地址|产品截图|效果图)/,
      /https?:\/\/(?:[\w-]+\.)?(?:vercel\.app|netlify\.app|pages\.dev|github\.io|render\.com|youtube\.com|youtu\.be|bilibili\.com)\S*/i,
      /!\[[^\]]*]\([^)]+\)/,
    ],
    passSummary: "README 中找到演示、截图或部署证据。",
    failSummary: "README 中未找到演示、截图或部署证据。",
    suggestion: "增加可访问的演示地址、演示视频或关键页面截图，并标明可用范围。",
  },
  {
    id: "roadmap",
    category: "submission",
    label: "后续改进",
    priority: "medium",
    minimumEvidence: 2,
    patterns: [
      /(?:roadmap|future work|next steps?|planned|todo|what'?s next)/i,
      /(?:后续计划|未来工作|下一步|路线图|待办|未来改进|计划功能)/,
    ],
    passSummary: "README 中找到后续计划或改进方向。",
    failSummary: "README 中未找到至少 2 个可识别的后续改进方向。",
    suggestion: "增加“后续改进”小节，列出 2–3 个方向，并说明优先级和代价。",
  },
  {
    id: "risks",
    category: "submission",
    label: "风险与边界",
    priority: "high",
    minimumEvidence: 3,
    patterns: [
      /(?:risk|boundary|limitation|known issue|security|privacy|trade-?off)/i,
      /(?:风险|边界|限制|局限|已知问题|安全|隐私|取舍)/,
    ],
    passSummary: "README 中找到至少 3 个可识别的风险、边界或处理说明。",
    failSummary: "README 中未找到至少 3 个可识别的风险、边界或处理说明。",
    suggestion: "至少列出 3 个风险或边界，并分别写明处理方式；不要只写一句笼统的“存在风险”。",
  },
];

function normalizeLine(line: string) {
  return line
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]\s|\d+[.)]\s|>\s?)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findEvidence(lines: string[], patterns: RegExp[]): CheckEvidence[] {
  const evidence: CheckEvidence[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const excerpt = normalizeLine(lines[index]);
    if (!excerpt || !patterns.some((pattern) => pattern.test(excerpt))) continue;

    evidence.push({
      line: index + 1,
      excerpt: excerpt.slice(0, 220),
    });
    if (evidence.length === MAX_EVIDENCE) break;
  }

  return evidence;
}

export function inspectReadme(
  content: string | null,
  options: { path: string | null; truncated: boolean },
  facts?: RepositoryFacts,
): Pick<RepositoryCheckReport, "readme" | "checks" | "groups" | "missing" | "totals"> {
  const readmeStatus = content === null ? "fail" : "pass";
  const lines = content?.split(/\r?\n/) ?? [];
  const readmeCheck: RepositoryCheckItem = {
    id: "readme",
    category: "submission",
    label: "README",
    priority: "high",
    status: readmeStatus,
    summary:
      content === null
        ? "仓库未提供可读取的 README。"
        : `已读取 ${options.path ?? "README"}${options.truncated ? "（仅检查前 300 KB）" : ""}。`,
    evidence:
      content === null
        ? []
        : [{ line: 1, excerpt: `${options.path ?? "README"} 可公开读取` }],
    suggestion:
      content === null
        ? "在仓库根目录添加 README，说明项目价值、运行方法与当前完成度。"
        : null,
  };

  const checks: RepositoryCheckItem[] = [
    readmeCheck,
    ...rules.map((rule): RepositoryCheckItem => {
      if (content === null) {
        return {
          id: rule.id,
          category: rule.category,
          label: rule.label,
          priority: rule.priority,
          status: "unknown",
          summary: "缺少 README，无法检查此项。",
          evidence: [],
          suggestion: rule.suggestion,
        };
      }

      const evidence = findEvidence(lines, rule.patterns);
      const minimumEvidence = rule.minimumEvidence ?? 1;
      return {
        id: rule.id,
        category: rule.category,
        label: rule.label,
        priority: rule.priority,
        status: evidence.length >= minimumEvidence ? "pass" : "fail",
        summary: evidence.length >= minimumEvidence ? rule.passSummary : rule.failSummary,
        evidence,
        suggestion: evidence.length >= minimumEvidence ? null : rule.suggestion,
      };
    }),
  ];

  if (facts) checks.push(...buildFactChecks(facts));

  const totals = checks.reduce<Record<"pass" | "fail" | "unknown", number>>(
    (result, check) => {
      result[check.status] += 1;
      return result;
    },
    { pass: 0, fail: 0, unknown: 0 },
  );

  return {
    readme: {
      status: readmeStatus,
      path: options.path,
      truncated: options.truncated,
    },
    checks,
    groups: groupChecks(checks),
    missing: checks
      .filter((check) => check.status === "fail")
      .map(({ id, category, label, priority, summary, suggestion, evidence }) => ({
        id,
        category,
        label,
        priority,
        summary,
        suggestion,
        evidence,
      })),
    totals,
  };
}

type FactDefinition = {
  id: Exclude<RepositoryCheckItem["id"], "readme" | "problem" | "features" | "setup" | "stack" | "challenges" | "demo" | "roadmap" | "risks">;
  category: Exclude<RepositoryCheckItem["category"], "submission">;
  label: string;
  priority: CheckPriority;
  value: boolean | null;
  passSummary: string;
  failSummary: string;
  unknownSummary: string;
  suggestion: string;
};

function factCheck(definition: FactDefinition): RepositoryCheckItem {
  const status = definition.value === null ? "unknown" : definition.value ? "pass" : "fail";
  return {
    id: definition.id,
    category: definition.category,
    label: definition.label,
    priority: definition.priority,
    status,
    summary:
      status === "pass"
        ? definition.passSummary
        : status === "fail"
          ? definition.failSummary
          : definition.unknownSummary,
    evidence: status === "pass" ? [{ line: 1, excerpt: "GitHub 公开元数据确认" }] : [],
    suggestion: status === "fail" ? definition.suggestion : null,
  };
}

function buildFactChecks(facts: RepositoryFacts): RepositoryCheckItem[] {
  const community = facts.community;
  const reproducibility = facts.reproducibility;
  const maintenance = facts.maintenance;
  type FactTuple = [FactDefinition["id"], string, CheckPriority, boolean | null, FactDefinition["category"], string, string, string, string];
  const definitions = [
    ["license", "许可证", "high", community.license, "collaboration", "检测到公开许可证声明。", "未检测到公开许可证声明。", "GitHub 当前无法确认许可证状态。", "为仓库添加明确的 LICENSE 文件。"],
    ["ci-workflow", "CI workflow", "medium", reproducibility.ciWorkflow, "reproducibility", "找到 GitHub Actions workflow。", "未找到 GitHub Actions workflow。", "GitHub 当前无法确认 CI workflow。", "至少加入安装、检查或测试的自动化 workflow。"],
    ["package-manifest", "依赖清单", "medium", reproducibility.packageManifest, "reproducibility", "找到项目依赖或构建清单。", "未找到常见项目依赖清单。", "当前无法确认项目依赖清单。", "提交适用于项目技术栈的依赖或构建清单。"],
    ["test-script", "测试入口", "high", reproducibility.testScript, "reproducibility", "项目清单声明了测试入口。", "未在项目清单中找到测试入口。", "当前无法确认测试入口。", "提供可复现的测试命令，并在 README 中说明。"],
    ["build-script", "Build 入口", "medium", reproducibility.buildScript, "reproducibility", "项目清单声明了 build 入口。", "未在项目清单中找到 build 入口。", "当前无法确认 build 入口。", "提供可复现的构建命令；检查器不会替你执行仓库代码。"],
    ["archived", "仓库归档状态", "high", maintenance.archived === null ? null : !maintenance.archived, "maintenance", "仓库当前未被归档。", "仓库当前已归档。", "当前无法确认仓库归档状态。", "如果项目仍在招新或面试中，请确认仓库没有被归档。"],
    ["recent-update", "近期维护信号", "medium", recentUpdateStatus(maintenance.pushedAt), "maintenance", recentUpdateSummary(maintenance.pushedAt), "超过约 6 个月未见公开推送。", "当前无法确认最近维护时间。", "如果项目仍在维护，请在 README 中说明当前状态或下一步计划。"],
  ] as FactTuple[];

  const typedDefinitions: FactDefinition[] = definitions.map(([id, label, priority, value, category, passSummary, failSummary, unknownSummary, suggestion]) =>
    makeFactDefinition(
      id,
      label,
      priority,
      value,
      category,
      passSummary,
      failSummary,
      unknownSummary,
      suggestion,
    ),
  );

  return typedDefinitions.map(factCheck);
}

function makeFactDefinition(
  id: FactDefinition["id"],
  label: string,
  priority: CheckPriority,
  value: boolean | null,
  category: FactDefinition["category"],
  passSummary: string,
  failSummary: string,
  unknownSummary: string,
  suggestion: string,
): FactDefinition {
  return { id, category, label, priority, value, passSummary, failSummary, unknownSummary, suggestion };
}

function recentUpdateStatus(pushedAt: string | null): boolean | null {
  if (!pushedAt) return null;
  const timestamp = Date.parse(pushedAt);
  if (!Number.isFinite(timestamp)) return null;
  return Date.now() - timestamp <= 1000 * 60 * 60 * 24 * 180;
}

function recentUpdateSummary(pushedAt: string | null): string {
  if (!pushedAt) return "当前无法确认最近维护时间。";
  return `最近公开推送时间：${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(pushedAt))}。`;
}

function groupChecks(checks: RepositoryCheckItem[]): RepositoryCheckReport["groups"] {
  const definitions = [
    ["submission", "提交表达", "README 中与项目价值、功能和交付说明直接相关的证据。"],
    ["collaboration", "基础公开性", "面试展示和公开交付前最需要确认的仓库许可事实。"],
    ["reproducibility", "可复现性", "只检查公开配置是否存在，不执行仓库代码，也不代表 CI 已通过。"],
    ["maintenance", "公开维护信号", "来自 GitHub 公开元数据的事实，不等同于项目质量结论。"],
  ] as const;
  return definitions.map(([id, label, description]) => ({
    id,
    label,
    description,
    checks: checks.filter((check) => check.category === id),
  }));
}
