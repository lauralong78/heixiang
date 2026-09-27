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
    description: "根据成员自愿公开的技能和兴趣找搭档，说明推荐依据，并在本机记录邀请状态。",
    category: "协作",
    status: "available",
    href: "/tools/team-match",
    tags: ["匹配", "技能互补", "邀请", "本机演示"],
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
    slug: "vote-wall",
    title: "观众投票墙",
    description: "建立作品墙并切换本机身份投票，处理重复投票、隐藏结果和作废记录。",
    category: "现场",
    status: "available",
    href: "/tools/vote-wall",
    tags: ["投票", "作品", "结果", "本机演示"],
  },
  {
    slug: "checkin-claim",
    title: "签到与领取",
    description: "建立名单并发放本地凭证，分别记录签到和领取，重复操作会明确提示。",
    category: "现场",
    status: "available",
    href: "/tools/checkin-claim",
    tags: ["签到", "凭证", "领取", "CSV"],
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
