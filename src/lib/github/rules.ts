import type {
  CheckEvidence,
  RepositoryCheckItem,
  RepositoryCheckReport,
} from "./types";

const MAX_EVIDENCE = 3;

type Rule = {
  id: Exclude<RepositoryCheckItem["id"], "readme">;
  label: string;
  patterns: RegExp[];
  passSummary: string;
  failSummary: string;
  suggestion: string;
};

const rules: Rule[] = [
  {
    id: "problem",
    label: "问题与目标用户",
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
    label: "核心功能",
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
    label: "运行方式",
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
    label: "技术栈",
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
    label: "问题与困难",
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
    label: "演示或部署",
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
    label: "后续改进",
    patterns: [
      /(?:roadmap|future work|next steps?|planned|todo|what'?s next)/i,
      /(?:后续计划|未来工作|下一步|路线图|待办|未来改进|计划功能)/,
    ],
    passSummary: "README 中找到后续计划或改进方向。",
    failSummary: "README 中未找到后续计划或改进方向。",
    suggestion: "增加“后续改进”小节，区分近期可做事项和长期设想。",
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
): Pick<RepositoryCheckReport, "readme" | "checks" | "totals"> {
  const readmeStatus = content === null ? "fail" : "pass";
  const lines = content?.split(/\r?\n/) ?? [];
  const readmeCheck: RepositoryCheckItem = {
    id: "readme",
    label: "README",
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
          label: rule.label,
          status: "unknown",
          summary: "缺少 README，无法检查此项。",
          evidence: [],
          suggestion: rule.suggestion,
        };
      }

      const evidence = findEvidence(lines, rule.patterns);
      return {
        id: rule.id,
        label: rule.label,
        status: evidence.length > 0 ? "pass" : "fail",
        summary: evidence.length > 0 ? rule.passSummary : rule.failSummary,
        evidence,
        suggestion: evidence.length > 0 ? null : rule.suggestion,
      };
    }),
  ];

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
    totals,
  };
}
