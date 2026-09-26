import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell-container grid gap-5 py-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Link href="/" className="brand-mark focus-ring w-fit">黑箱</Link>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">
            黑客松现场要用的几个小工具。按需打开，不用登录，也没有固定流程。
          </p>
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--text-faint)]">
          BUILD SMALL. PROVE IT WORKS.
        </p>
      </div>
    </footer>
  );
}
