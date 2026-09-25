import type { Metadata } from "next";

import { RepositoryChecker } from "./repository-checker";

export const metadata: Metadata = {
  title: "GitHub 仓库检查 | HackKit",
  description: "用可追溯的 README 证据检查公开 GitHub 仓库的提交完整度。",
};

export default function RepositoryCheckPage() {
  return <RepositoryChecker />;
}
