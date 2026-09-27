import type { Metadata } from "next";

import { TeamMatchWorkspace } from "./team-match-workspace";

export const metadata: Metadata = {
  title: "队友匹配 · 黑箱",
  description: "在同一浏览器内用自愿填写的资料生成可追溯队友建议。",
};

export default function TeamMatchPage() {
  return (
    <>
      <p style={{ margin: 0, padding: "10px 16px", background: "#d7f4ca", color: "#17231f", fontSize: 12, textAlign: "center" }}>
        本机演示，不支持真实账号、跨设备共享或线上安全授权
      </p>
      <TeamMatchWorkspace />
    </>
  );
}
