import type { Metadata } from "next";

import { IcebreakerWorkspace } from "./icebreaker-workspace";

export const metadata: Metadata = {
  title: "现场破冰匹配 | HackKit",
  description: "在一台设备上登记现场成员，生成可解释、少重复的本地破冰配对。",
};

export default function IcebreakerPage() {
  return <IcebreakerWorkspace />;
}
