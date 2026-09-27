import type { Metadata } from "next";

import { CheckinClaimApp } from "./checkin-claim-app";

export const metadata: Metadata = {
  title: "签到与领取",
  description: "本机演示的签到与领取凭证工具。",
};

export default function CheckinClaimPage() { return <CheckinClaimApp />; }
