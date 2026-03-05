"use client";

import React from "react";
import { signOut } from "firebase/auth";
import Image from "next/image";
import { Badge } from "@/ui-kit/badge";
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from "@/ui-kit/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from "@/ui-kit/sidebar";
import { SidebarLayout } from "@/ui-kit/sidebar-layout";
import { Text } from "@/ui-kit/text";
import { firebaseAuth } from "@/lib/firebase/client";
import { useBusinessAccess } from "@/lib/auth/business";
import { useRequireAdmin } from "@/lib/auth/routeGuards";
import { usePathname, useRouter } from "next/navigation";

type NavItem = { href: string; label: string };

const navItems: NavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/causes", label: "Charities" },
  { href: "/admin/qrs", label: "QR Codes" },
  { href: "/admin/giveaways", label: "Giveaways" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/donations", label: "Support" },
];

function AdminNavbar({
  userEmail,
  onSignOut,
}: {
  userEmail: string;
  onSignOut: () => void;
}) {
  return (
    <Navbar className="mx-auto max-w-6xl px-2">
      <NavbarSection>
        <NavbarItem href="/">
          <Image
            src="/RackUp-01.svg"
            alt="Rack Up"
            width={140}
            height={40}
            className="h-10 w-auto"
          />
          <span className="sr-only">Rack Up</span>
        </NavbarItem>
        <NavbarItem href="/admin">
          <NavbarLabel>Admin</NavbarLabel>
        </NavbarItem>
        <Badge color="emerald">Secure</Badge>
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <NavbarLabel className="hidden text-sm text-zinc-300 sm:block">{userEmail}</NavbarLabel>
        <NavbarItem href="/profile">
          <NavbarLabel>Profile</NavbarLabel>
        </NavbarItem>
        <NavbarItem onClick={onSignOut}>
          <NavbarLabel>Sign out</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
    </Navbar>
  );
}

function AdminSidebar({
  pathname,
  onSignOut,
  businessId,
}: {
  pathname: string;
  onSignOut: () => void;
  businessId?: string;
}) {
  return (
    <Sidebar className="bg-white text-zinc-950 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:text-white dark:ring-white/10">
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <Image
            src="/RackUp-01.svg"
            alt="Rack Up"
            width={32}
            height={32}
            className="h-8 w-auto"
          />
          <div>
            <SidebarLabel className="text-base font-semibold">Admin dashboard</SidebarLabel>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">Platform controls</Text>
          </div>
        </div>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          <SidebarHeading>Navigate</SidebarHeading>
          {navItems.map((item) => (
            <SidebarItem key={item.href} href={item.href} current={pathname === item.href}>
              <SidebarLabel>{item.label}</SidebarLabel>
            </SidebarItem>
          ))}
        </SidebarSection>
        {businessId ? (
          <SidebarSection>
            <SidebarHeading>Business console</SidebarHeading>
            <SidebarItem href={`/biz/${businessId}`}>
              <Badge color="emerald">Staff</Badge>
              <SidebarLabel>{businessId}</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        ) : null}
        <SidebarSpacer />
      </SidebarBody>
      <SidebarFooter>
        <SidebarSection>
          <SidebarItem href="/profile">
            <SidebarLabel>Profile</SidebarLabel>
          </SidebarItem>
          <SidebarItem onClick={onSignOut}>
            <SidebarLabel>Sign out</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAdmin, loading } = useRequireAdmin("/profile");
  const { membership } = useBusinessAccess();

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200 shadow-lg">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
          Loading admin…
        </div>
      </div>
    );
  }

  return (
    <SidebarLayout
      className="bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white"
      mainClassName="pt-0 pb-0 lg:pt-0 lg:pr-0 lg:pl-64"
      frameClassName="p-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 dark:lg:bg-transparent"
      navbar={
        <AdminNavbar
          userEmail={user.email ?? ""}
          onSignOut={() => {
            void signOut(firebaseAuth);
            router.replace("/signin");
          }}
        />
      }
      sidebar={
        <AdminSidebar
          pathname={pathname}
          businessId={membership?.businessId}
          onSignOut={() => {
            void signOut(firebaseAuth);
            router.replace("/signin");
          }}
        />
      }
    >
      <div className="space-y-4">{children}</div>
    </SidebarLayout>
  );
}
