import type { Metadata } from "next";

import { FormalAuthApp } from "./formal-auth-app";

export const metadata: Metadata = {
  title: "正式版看板登录",
  description: "黑箱正式版进度看板的账号登录与注册入口。",
};

export default function FormalBoardPage() {
  return <FormalAuthApp />;
}
