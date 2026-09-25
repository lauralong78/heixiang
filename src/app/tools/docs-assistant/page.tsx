import type { Metadata } from "next";

import { DocsAssistant } from "./docs-assistant";

export const metadata: Metadata = {
  title: "项目文档助手 | HackKit",
  description: "用真实项目资料生成可编辑、可下载的 README 与一页说明。",
};

export default function DocsAssistantPage() {
  return <DocsAssistant />;
}
