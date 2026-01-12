"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import Image from "next/image";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { Heading } from "@/ui-kit/heading";
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
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBusinessAccess } from "@/lib/auth/business";
import { useAdminStatus } from "@/lib/auth/admin";

type NavItem = { href: (businessId: string) => string; label: string };

const navItems: NavItem[] = [
  { href: (id) => `/biz/${id}`, label: "Overview" },
  { href: (id) => `/biz/${id}/donations`, label: "Donations" },
  { href: (id) => `/biz/${id}/deals`, label: "Deals" },
  { href: (id) => `/biz/${id}/rewards`, label: "Rewards" },
  { href: (id) => `/biz/${id}/causes`, label: "Causes" },
];

function BusinessNavbar({
  businessId,
  membershipRole,
  userEmail,
  onSignOut,
}: {
  businessId: string;
  membershipRole: string;
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
        <NavbarItem href={`/biz/${businessId}`}>
          <NavbarLabel className="truncate">Business console</NavbarLabel>
        </NavbarItem>
        <Badge color="emerald" className="ml-1">
          {membershipRole}
        </Badge>
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <NavbarLabel className="hidden text-sm text-zinc-300 sm:block">{userEmail}</NavbarLabel>
        <NavbarItem onClick={onSignOut}>
          <NavbarLabel>Sign out</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
    </Navbar>
  );
}

function BusinessSidebar({
  businessId,
  role,
  pathname,
  onSignOut,
  showAdmin,
  onAdmin,
}: {
  businessId: string;
  role: string;
  pathname: string;
  onSignOut: () => void;
  showAdmin: boolean;
  onAdmin: () => void;
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
            <SidebarLabel className="text-base font-semibold">Business Console</SidebarLabel>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">{businessId}</Text>
          </div>
        </div>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          <SidebarHeading>Navigation</SidebarHeading>
          {navItems.map((item) => {
            const href = item.href(businessId);
            return (
              <SidebarItem key={href} href={href} current={pathname === href}>
                <SidebarLabel>{item.label}</SidebarLabel>
              </SidebarItem>
            );
          })}
        </SidebarSection>
        <SidebarSpacer />
      </SidebarBody>
      <SidebarFooter>
        <SidebarSection>
          <Badge color="emerald">{role}</Badge>
          <SidebarItem onClick={onSignOut}>
            <SidebarLabel>Sign out</SidebarLabel>
          </SidebarItem>
          {showAdmin ? (
            <Button onClick={onAdmin} color="emerald" className="w-full">
              Admin
            </Button>
          ) : null}
        </SidebarSection>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [resolvedParams, setResolvedParams] = useState<{ businessId: string } | null>(null);
  const { membership, loading } = useBusinessAccess();
  const { isAdmin } = useAdminStatus();

  useEffect(() => {
    params.then((p) => setResolvedParams(p));
  }, [params]);

  const businessId = resolvedParams?.businessId;

  if (loading || !businessId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-sm text-zinc-200">Loading…</div>
      </div>
    );
  }

  if (!user || !membership || membership.businessId !== businessId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-200 shadow-sm">
          <Heading level={2} className="text-lg font-semibold text-white">
            Access denied
          </Heading>
          <Text className="mt-2 text-zinc-300">
            You need staff access for this business to view this console.
          </Text>
          <div className="mt-4 flex items-center justify-center gap-3 text-xs">
            <Button href="/profile" outline>
              Profile
            </Button>
            <Button
              plain
              onClick={() => {
                void signOut(firebaseAuth);
                router.replace("/signin");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarLayout
      className="bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white"
      contentClassName="max-w-none"
      navbar={
        <BusinessNavbar
          businessId={businessId}
          membershipRole={membership.role}
          userEmail={user.email ?? ""}
          onSignOut={() => {
            void signOut(firebaseAuth);
            router.replace("/signin");
          }}
        />
      }
      sidebar={
        <BusinessSidebar
          businessId={businessId}
          role={membership.role}
          pathname={pathname}
          onSignOut={() => {
            void signOut(firebaseAuth);
            router.replace("/signin");
          }}
          showAdmin={isAdmin}
          onAdmin={() => router.push("/admin")}
        />
      }
    >
      <div className="w-full">{children}</div>
    </SidebarLayout>
  );
}
