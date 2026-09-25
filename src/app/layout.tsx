import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HackKit | 黑客松微工具箱",
    template: "%s | HackKit",
  },
  description: "面向黑客松现场的独立微工具目录，按需打开，快速完成真实任务。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <a href="#main-content" className="skip-link">
          跳到主要内容
        </a>
        <div className="flex min-h-[100dvh] flex-col">
          <SiteHeader />
          <div id="main-content" className="flex-1" tabIndex={-1}>
            {children}
          </div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
