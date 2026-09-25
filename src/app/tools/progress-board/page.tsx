import type { Metadata } from "next";

import { ProgressBoardApp } from "./progress-board-app";

export const metadata: Metadata = {
  title: "倒计时 / 进度看板",
  description: "在单台设备上管理黑客松倒计时、队伍任务与总体进度，支持本地备份恢复。",
};

export default function ProgressBoardPage() {
  return <ProgressBoardApp />;
}
