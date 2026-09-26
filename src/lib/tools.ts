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
    description: "填好角色、技能和想做的方向，生成一张可以下载的 PNG 名片。",
    category: "协作",
    status: "available",
    href: "/tools/card",
    tags: ["组队", "个人资料", "PNG", "导出"],
  },
  {
    slug: "repo-check",
    title: "仓库检查器",
    description: "检查公开 GitHub 仓库的 README 和提交材料，列出证据、缺项和无法确认的内容。",
    category: "交付",
    status: "available",
    href: "/tools/repo-check",
    tags: ["GitHub", "README", "提交", "证据"],
  },
  {
    slug: "team-match",
    title: "队友匹配",
    description: "根据成员愿意公开的技能和兴趣给出匹配建议，并记录邀请状态。",
    category: "协作",
    status: "roadmap",
    tags: ["匹配", "技能互补", "邀请"],
  },
  {
    slug: "progress-board",
    title: "进度看板",
    description: "记录活动截止时间、队伍任务和完成进度，可导出或恢复本地 JSON 备份。",
    category: "现场",
    status: "available",
    href: "/tools/progress-board",
    tags: ["倒计时", "看板", "进度", "JSON"],
  },
  {
    slug: "icebreaker",
    title: "现场破冰",
    description: "按昵称、技能和兴趣安排轮换配对，尽量减少重复，并说明配对依据。",
    category: "现场",
    status: "available",
    href: "/tools/icebreaker",
    tags: ["破冰", "配对", "公平轮换", "交流"],
  },
  {
    slug: "voting-wall",
    title: "观众投票墙",
    description: "创建投票、接收作品并统计结果，同时处理重复提交。",
    category: "现场",
    status: "roadmap",
    tags: ["投票", "作品", "结果"],
  },
  {
    slug: "check-in",
    title: "签到与领取",
    description: "记录签到或资源领取情况，生成凭证，并提示重复操作。",
    category: "现场",
    status: "roadmap",
    tags: ["签到", "二维码", "资源"],
  },
  {
    slug: "docs-assistant",
    title: "项目文档助手",
    description: "用已经确认的项目资料生成 README 和一页说明，缺的信息会单独列出。",
    category: "内容",
    status: "available",
    href: "/tools/docs-assistant",
    tags: ["README", "项目说明", "缺失检查", "Markdown"],
  },
];

export const availableToolCount = tools.filter(
  (tool) => tool.status === "available",
).length;
