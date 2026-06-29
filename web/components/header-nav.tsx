"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/search", label: "Sök", icon: Search },
  { href: "/favoriter", label: "Favoriter", icon: Heart },
] as const;

const baseClass =
  "inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 transition-colors";

/**
 * Primary nav links for the app header. A client component so the active route can be highlighted
 * via usePathname — active link gets bg-muted + ink; inactive is dim with an ink hover (handoff 3a).
 * usePathname is dynamic, so this is rendered inside a <Suspense> boundary (see HeaderNavFallback)
 * to satisfy Next 16's cacheComponents prerender contract.
 */
export function HeaderNav() {
  const pathname = usePathname();
  return (
    <>
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              baseClass,
              active ? "bg-muted font-medium text-ink" : "text-ink-dim hover:text-ink",
            )}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Static, no-active-state version rendered while the dynamic nav suspends during prerender. */
export function HeaderNavFallback() {
  return (
    <>
      {NAV_LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cn(baseClass, "text-ink-dim hover:text-ink")}>
          <Icon size={15} />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </>
  );
}
