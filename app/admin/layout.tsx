"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { useRequireAdmin } from "@/lib/auth/routeGuards";

type NavItem = { href: string; label: string };

const navItems: NavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/charities", label: "Charities" },
  { href: "/admin/donations", label: "Donations" },
];

function NavLink({ href, label }: NavItem) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      className={[
        "flex h-10 items-center rounded-xl px-3 text-sm font-medium transition-colors",
        isActive
          ? "bg-black/[.06] text-zinc-950 dark:bg-white/10 dark:text-zinc-50"
          : "text-zinc-700 hover:bg-black/[.04] dark:text-zinc-300 dark:hover:bg-white/5",
      ].join(" ")}
      href={href}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useRequireAdmin("/profile");

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-black">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold tracking-tight">Rack Up</div>
                <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  Admin Dashboard
                </div>
              </div>
              <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[.04] px-2.5 py-1 text-xs font-medium text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-zinc-50">
                Admin
              </span>
            </div>

            <nav className="mt-5 space-y-1">
              {navItems.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </nav>

            <div className="mt-6 border-t border-black/10 pt-4 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">
              <div className="truncate">Signed in: {user.email}</div>
              <div className="mt-3 flex items-center gap-3">
                <Link className="underline" href="/profile">
                  Profile
                </Link>
                <button
                  className="underline"
                  type="button"
                  onClick={() => signOut(firebaseAuth)}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="w-full">
          <header className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black md:hidden">
            <div>
              <div className="text-sm font-semibold tracking-tight">Admin Dashboard</div>
              <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {user.email}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link className="text-sm underline" href="/profile">
                Profile
              </Link>
              <button
                className="text-sm underline"
                type="button"
                onClick={() => signOut(firebaseAuth)}
              >
                Sign out
              </button>
            </div>
          </header>

          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

