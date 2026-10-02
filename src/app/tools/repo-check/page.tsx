import type { Metadata } from "next";

import { ToolUsageGuide } from "@/components/help/tool-usage-guide";
import { RepositoryChecker } from "./repository-checker";

export const metadata: Metadata = {
  title: "GitHub 仓库检查",
  description: "用可追溯的 README 证据检查公开 GitHub 仓库的提交完整度。",
};

export default function RepositoryCheckPage() {
  return (
    <>
      <RepositoryChecker />
      <ToolUsageGuide
        title="GitHub 仓库检查"
        intro="先准备一个公开的 GitHub 仓库地址，再让检查器逐项核对提交前的 README 和交付信息。"
        steps={[
          "填写公开的 github.com/owner/repo 仓库地址。",
          "点击开始检查，等待公开只读请求完成。",
          "按已确认、缺失和无法确认三类阅读结果，并查看每项证据。",
          "根据缺失项补齐仓库内容；改完后可以再次检查。",
        ]}
        note="只检查公开仓库，不保证一定能查到所有信息；遇到 GitHub 限流或暂时不可用时，请稍后重试。"
      />
    </>
  );
}
