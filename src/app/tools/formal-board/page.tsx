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
          { title: "1. 先注册或登录", detail: "使用自选 ID 和密码进入账号；登录后会看到属于你的活动列表。" },
          { title: "2. 创建或加入活动", detail: "组织者创建活动并生成邀请链接；其他成员通过邀请加入对应活动。" },
          { title: "3. 建立队伍和任务", detail: "队长建立队伍、添加任务，再把任务分配给具体成员。" },
          { title: "4. 更新任务进度", detail: "成员打开分配给自己的任务，按实际情况更新进度；组织者和队长可以查看整体情况。" },
        ]}
        note="这是本机单实例演示；不要把它当成跨设备协作或公开互联网服务。"
      />
    </>
  );
}
