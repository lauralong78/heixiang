import Link from "next/link";
import type { ReactNode } from "react";

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="tool-back-nav" aria-label="工具页导航">
        <div className="shell-container tool-back-nav__inner">
          <Link className="tool-back-nav__link focus-ring" href="/#tools">
            <svg
              aria-hidden="true"
              className="tool-back-nav__icon"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>返回工具选择</span>
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
