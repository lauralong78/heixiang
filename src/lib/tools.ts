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
  purpose: string;
};

export const toolCategories = ["全部", "协作", "交付", "现场", "内容"] as const;
export type ToolCategoryFilter = (typeof toolCategories)[number];

/** 当前黑客松工具箱目录：四项都对应真实存在、可直接打开的工具。 */
export const tools: HackKitTool[] = [
  {
    slug: "formal-board",
    title: "进度看板",
    description: "用自选 ID 和密码进入服务端会话，管理活动、队伍、任务与邀请。",
    category: "协作",
    status: "available",
    href: "/tools/formal-board",
    tags: ["账号", "活动", "队伍", "任务"],
    purpose: "组织者创建活动，队长组建队伍并分配任务，成员更新自己负责的进度。",
  },
  {
    slug: "formal-vote-wall",
    title: "投票墙",
    description: "在同一正式会话下管理活动、成员与队伍候选，记录单票去重后的结果状态。",
    category: "现场",
    status: "available",
    href: "/tools/formal-vote-wall",
    tags: ["成员", "候选", "单票", "结果"],
    purpose: "活动成员为队伍候选投票，组织者查看并控制投票状态与结果。",
  },
  {
    slug: "repo-check",
    title: "GitHub 仓库检查",
    description: "输入公开 github.com 仓库地址，读取只读证据并输出 pass、fail 或 unknown。",
    category: "交付",
    status: "available",
    href: "/tools/repo-check",
    tags: ["公开仓库", "证据", "限流", "错误态"],
    purpose: "提交前检查公开仓库的 README 和交付信息，区分已确认、缺失与无法确认。",
  },
  {
    slug: "docs-assistant",
    title: "项目文档助手",
    description: "根据你输入的项目资料生成或编辑 README 与一页说明，并列出缺失清单。",
    category: "内容",
    status: "available",
    href: "/tools/docs-assistant",
    tags: ["README", "一页说明", "缺失清单", "Markdown"],
    purpose: "把已确认的项目资料整理成 README 和一页说明，列出缺失项并支持编辑、复制和下载。",
  },
];

/** 旧工具保留给既有路由与源码使用，但不进入当前招新目录或计数。 */
export const legacyTools: HackKitTool[] = [
  { slug: "card", title: "组队名片", description: "旧版工具，路由保留。", category: "协作", status: "available", href: "/tools/card", tags: [], purpose: "不在当前目录。" },
  { slug: "progress-board", title: "进度看板", description: "旧版工具，路由保留。", category: "现场", status: "available", href: "/tools/progress-board", tags: [], purpose: "不在当前目录。" },
  { slug: "icebreaker", title: "现场破冰", description: "旧版工具，路由保留。", category: "现场", status: "available", href: "/tools/icebreaker", tags: [], purpose: "不在当前目录。" },
  { slug: "team-match", title: "队友匹配", description: "旧版工具，路由保留。", category: "协作", status: "available", href: "/tools/team-match", tags: [], purpose: "不在当前目录。" },
  { slug: "vote-wall", title: "观众投票墙", description: "旧版工具，路由保留。", category: "现场", status: "available", href: "/tools/vote-wall", tags: [], purpose: "不在当前目录。" },
  { slug: "checkin-claim", title: "签到与领取", description: "旧版工具，路由保留。", category: "现场", status: "available", href: "/tools/checkin-claim", tags: [], purpose: "不在当前目录。" },
];

export const availableToolCount = tools.filter((tool) => tool.status === "available").length;
