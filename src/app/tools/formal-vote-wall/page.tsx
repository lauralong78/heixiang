import type { Metadata } from "next";

import { ToolUsageGuide } from "@/components/help/tool-usage-guide";
import { FormalVoteWallApp } from "./formal-vote-wall-app";

export const metadata: Metadata = {
  title: "正式投票墙",
  description: "黑箱正式版私有活动投票墙：查看候选项、投票并按规则查看结果。",
};

export default function FormalVoteWallPage() {
  return (
    <>
      <FormalVoteWallApp />
      <ToolUsageGuide
        title="投票墙"
        intro="先从进度看板登录并加入活动，等组织者开放投票后再选择一个队伍候选。"
        steps={[
          "先在进度看板注册或登录，并进入已加入的活动。",
          "打开投票墙，确认当前活动和投票规则。",
          "等组织者开放投票后，选择一个队伍候选并提交。",
          "根据活动设置查看结果；结果可能只显示已记录，也可能显示当前或最终票数。",
        ]}
        note="投票墙与看板使用同一套本机演示数据，不支持跨设备投票；投票状态和结果展示由活动设置决定。"
      />
    </>
  );
}
