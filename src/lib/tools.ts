export type ToolCategory = "协作" | "交付" | "现场" | "内容";

export type ToolStatus = "available" | "roadmap";

export type HackKitTool = {
  slug: string;
  title: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  href?: string;
  tags: string[];
};

export const toolCategories = ["全部", "协作", "交付", "现场", "内容"] as const;

export type ToolCategoryFilter = (typeof toolCategories)[number];

export const tools: HackKitTool[] = [
  {
    slug: "card",
    title: "组队名片",
    description: "填写技能、兴趣、角色与简介，实时预览并导出可分享的 PNG 名片。",
    category: "协作",
    status: "available",
    href: "/tools/card",
    tags: ["组队", "个人资料", "PNG", "导出"],
  },
  {
    slug: "repo-check",
    title: "仓库检查器",
    description: "输入公开 GitHub 仓库，核对提交材料并查看逐项证据与无法确认项。",
    category: "交付",
    status: "available",
    href: "/tools/repo-check",
    tags: ["GitHub", "README", "提交", "证据"],
  },
  {
    slug: "team-match",
    title: "队友匹配",
    description: "根据自愿公开的技能与兴趣给出有依据的匹配建议，并管理邀请状态。",
    category: "协作",
    status: "roadmap",
    tags: ["匹配", "技能互补", "邀请"],
  },
  {
    slug: "progress-board",
    title: "进度看板",
    description: "同时展示多支队伍的倒计时与关键进展，方便现场快速掌握节奏。",
    category: "现场",
    status: "roadmap",
    tags: ["倒计时", "看板", "进度"],
  },
  {
    slug: "icebreaker",
    title: "现场破冰",
    description: "按自愿分享的技能与兴趣完成公平配对，并提供有上下文的交流提示。",
    category: "现场",
    status: "roadmap",
    tags: ["破冰", "配对", "交流"],
  },
  {
    slug: "voting-wall",
    title: "观众投票墙",
    description: "创建投票活动、收集合格投票并展示结果，同时处理重复提交。",
    category: "现场",
    status: "roadmap",
    tags: ["投票", "作品", "结果"],
  },
  {
    slug: "check-in",
    title: "签到与领取",
    description: "生成可核验凭证，记录签到或资源领取，并提示重复与异常操作。",
    category: "现场",
    status: "roadmap",
    tags: ["签到", "二维码", "资源"],
  },
  {
    slug: "docs-assistant",
    title: "项目文档助手",
    description: "基于真实项目资料生成 README 或演示提纲草稿，并标出缺失信息。",
    category: "内容",
    status: "roadmap",
    tags: ["README", "演示", "草稿"],
  },
];

export const availableToolCount = tools.filter(
  (tool) => tool.status === "available",
).length;
