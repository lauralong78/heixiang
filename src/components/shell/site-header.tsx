import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell-container flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href="/" className="brand-mark focus-ring" aria-label="黑箱首页">
          <span className="brand-bracket" aria-hidden="true">[</span>
          <span>黑箱</span>
          <span className="brand-bracket" aria-hidden="true">]</span>
        </Link>

        <nav aria-label="主导航" className="flex items-center gap-1 sm:gap-3">
          <Link href="/#tools" className="nav-link focus-ring">工具目录</Link>
          <span className="header-state" aria-label="当前阶段">第一阶段</span>
        </nav>
      </div>
    </header>
  );
}
