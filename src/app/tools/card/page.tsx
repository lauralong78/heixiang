import type { Metadata } from "next";

import { CardEditor } from "./card-editor";

export const metadata: Metadata = {
  title: "组队名片生成器 | HackKit",
  description: "填写你的技能与兴趣，实时生成并下载黑客松组队名片。",
};

export default function CardPage() {
  return <CardEditor />;
}
