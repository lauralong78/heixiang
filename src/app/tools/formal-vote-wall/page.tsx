import type { Metadata } from "next";

import { FormalVoteWallApp } from "./formal-vote-wall-app";

export const metadata: Metadata = {
  title: "正式投票墙",
  description: "黑箱正式版私有活动投票墙：查看候选项、投票并按规则查看结果。",
};

export default function FormalVoteWallPage() {
  return <FormalVoteWallApp />;
}
