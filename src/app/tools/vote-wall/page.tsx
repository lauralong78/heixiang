import type { Metadata } from "next";

import { VoteWallApp } from "./vote-wall-app";

export const metadata: Metadata = {
  title: "观众投票墙",
  description: "同一浏览器本机演示的单选投票墙，支持资格、结果模式和审计导出。",
};

export default function VoteWallPage() {
  return <VoteWallApp />;
}
