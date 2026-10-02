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
          { title: "1. 填写公开仓库地址", detail: "输入 github.com/owner/repo 格式的公开仓库地址；不要填写私有仓库或 Token。" },
          { title: "2. 开始只读检查", detail: "点击开始检查，等待工具读取 GitHub 的公开信息和 README。" },
          { title: "3. 按状态阅读结果", detail: "分别查看已确认、缺失和无法确认三类结果，并打开对应证据了解判断依据。" },
          { title: "4. 补齐后再次检查", detail: "根据缺失项修改仓库或 README，完成提交前整理后可以重新运行检查。" },
        ]}
        note="只检查公开仓库，不保证一定能查到所有信息；遇到 GitHub 限流或暂时不可用时，请稍后重试。"
      />
    </>
  );
}
