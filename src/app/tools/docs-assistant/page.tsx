import type { Metadata } from "next";

import { ToolUsageGuide } from "@/components/help/tool-usage-guide";
import { DocsAssistant } from "./docs-assistant";

export const metadata: Metadata = {
  title: "项目文档助手",
  description: "用真实项目资料生成可编辑、可下载的 README 与一页说明。",
};

export default function DocsAssistantPage() {
  return (
    <>
      <DocsAssistant />
      <ToolUsageGuide
        title="项目文档助手"
        intro="先填入你已经确认的项目资料，再用缺失清单检查哪些内容还需要补充。"
        steps={[
          { title: "1. 填写真实资料", detail: "输入项目目标、核心功能、运行方式、技术栈和你已经确认的其他信息。" },
          { title: "2. 查看缺失清单", detail: "检查 README 与一页说明分别还缺什么，只补充你能确认的内容。" },
          { title: "3. 编辑生成结果", detail: "在编辑区调整 Markdown 的措辞、顺序和结构，让文档符合项目实际情况。" },
          { title: "4. 复制或下载", detail: "确认内容无误后复制文本，或下载 Markdown 文件用于提交和交付。" },
        ]}
        note="它只整理你提供的真实资料，不会自动补事实；不确定的内容请留在缺失清单中。"
      />
    </>
  );
}
