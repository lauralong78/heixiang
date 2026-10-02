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
          "填写项目目标、核心功能、运行方式、技术栈和其他真实资料。",
          "查看 README 与一页说明的缺失清单，补齐你能确认的信息。",
          "编辑生成的 Markdown，调整措辞和结构。",
          "确认内容无误后复制文本，或下载 Markdown 文件交付。",
        ]}
        note="它只整理你提供的真实资料，不会自动补事实；不确定的内容请留在缺失清单中。"
      />
    </>
  );
}
