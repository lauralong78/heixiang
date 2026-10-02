import type { Metadata } from "next";

import { ToolUsageGuide } from "@/components/help/tool-usage-guide";
import { FormalAuthApp } from "./formal-auth-app";

export const metadata: Metadata = {
  title: "正式版看板登录",
  description: "黑箱正式版进度看板的账号登录与注册入口。",
};

export default function FormalBoardPage() {
  return (
    <>
      <FormalAuthApp />
      <ToolUsageGuide
        title="进度看板"
        intro="先注册或登录，再从一个活动开始，把队伍和任务分工落到看板上。"
        steps={[
          "注册或登录，进入你的活动列表。",
          "创建活动，并生成邀请链接或接受邀请加入活动。",
          "队长建立队伍、添加任务并把任务分配给成员。",
          "成员打开自己的任务，更新实际进度；组织者和队长可查看整体情况。",
        ]}
        note="这是本机单实例演示；不要把它当成跨设备协作或公开互联网服务。"
      />
    </>
  );
}
