"use client";

import clsx from "clsx";
import { signOut } from "firebase/auth";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import {
  Navbar,
  NavbarDivider,
  NavbarItem,
  NavbarLabel,
  NavbarSection,
  NavbarSpacer,
} from "@/ui-kit/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/ui-kit/sidebar";
import { Badge } from "@/ui-kit/badge";
import { Button } from "@/ui-kit/button";
import { StackedLayout } from "@/ui-kit/stacked-layout";
import { useAdminStatus } from "@/lib/auth/admin";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBusinessAccess } from "@/lib/auth/business";
import { firebaseAuth } from "@/lib/firebase/client";

type PublicShellProps = {
  children: React.ReactNode;
  contentClassName?: string;
};

const mainNav = [
  { label: "Home", href: "/" },
  { label: "Rewards", href: "/rewards" },
  { label: "Donate", href: "/donate" },
];

function PublicNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { membership } = useBusinessAccess();
  const { isAdmin } = useAdminStatus();

  async function handleSignOut() {
    await signOut(firebaseAuth);
    router.push("/signin");
  }

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
        <NavbarDivider className="hidden md:block" />
        {mainNav.map((item) => (
          <NavbarItem
            key={item.href}
            href={item.href}
            current={pathname === item.href}
            className="hidden md:inline-flex"
          >
            <NavbarLabel>{item.label}</NavbarLabel>
          </NavbarItem>
        ))}
      </NavbarSection>

      <NavbarSpacer />

      <NavbarSection>
        {membership ? (
          <NavbarItem href={`/biz/${membership.businessId}`} className="hidden md:inline-flex">
            <Badge color="emerald">{membership.businessId}</Badge>
            <NavbarLabel className="hidden sm:inline">Business console</NavbarLabel>
          </NavbarItem>
        ) : null}
        {isAdmin ? (
          <NavbarItem href="/admin" className="hidden md:inline-flex">
            <Badge color="emerald">Admin</Badge>
            <NavbarLabel className="hidden sm:inline">Admin</NavbarLabel>
          </NavbarItem>
        ) : null}
        {user ? (
          <>
            <NavbarItem
              href="/profile"
              current={pathname.startsWith("/profile")}
              className="hidden md:inline-flex"
            >
              <NavbarLabel>Profile</NavbarLabel>
            </NavbarItem>
            <NavbarItem
              href="/rewards/history"
              current={pathname.startsWith("/rewards/history")}
              className="hidden md:inline-flex"
            >
              <NavbarLabel>My rewards</NavbarLabel>
            </NavbarItem>
            <NavbarItem onClick={handleSignOut} className="hidden md:inline-flex">
              <NavbarLabel>Sign out</NavbarLabel>
            </NavbarItem>
          </>
        ) : (
          <>
            <NavbarItem
              href="/signin"
              current={pathname.startsWith("/signin")}
              className="hidden md:inline-flex"
            >
              <NavbarLabel>Sign in</NavbarLabel>
            </NavbarItem>
            <Button href="/signup" color="emerald" className="hidden sm:inline-flex">
              Join Rack Up
            </Button>
          </>
        )}
      </NavbarSection>
    </Navbar>
  );
}

function PublicSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { membership } = useBusinessAccess();
  const { isAdmin } = useAdminStatus();

  async function handleSignOut() {
    await signOut(firebaseAuth);
    router.push("/signin");
  }

  return (
    <Sidebar className="bg-white text-zinc-950 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:text-white dark:ring-white/10">
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Image
            src="/RackUp-01.svg"
            alt="Rack Up"
            width={28}
            height={28}
            className="h-7 w-auto"
          />
          <div>
            <SidebarLabel>Rack Up</SidebarLabel>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Give back &amp; earn</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          <SidebarHeading>Navigate</SidebarHeading>
          {mainNav.map((item) => (
            <SidebarItem key={item.href} href={item.href} current={pathname === item.href}>
              <SidebarLabel>{item.label}</SidebarLabel>
            </SidebarItem>
          ))}
        </SidebarSection>

        <SidebarSection>
          <SidebarHeading>Account</SidebarHeading>
          {user ? (
            <>
              <SidebarItem href="/profile" current={pathname.startsWith("/profile")}>
                <SidebarLabel>Profile</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/rewards/history" current={pathname.startsWith("/rewards/history")}>
                <SidebarLabel>My rewards</SidebarLabel>
              </SidebarItem>
            </>
          ) : (
            <>
              <SidebarItem href="/signin" current={pathname.startsWith("/signin")}>
                <SidebarLabel>Sign in</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/signup" current={pathname.startsWith("/signup")}>
                <SidebarLabel>Create account</SidebarLabel>
              </SidebarItem>
            </>
          )}
        </SidebarSection>

        {membership || isAdmin ? (
          <SidebarSection>
            <SidebarHeading>Workspace</SidebarHeading>
            {membership ? (
              <SidebarItem href={`/biz/${membership.businessId}`}>
                <Badge color="emerald">{membership.role}</Badge>
                <SidebarLabel className="truncate">{membership.businessId}</SidebarLabel>
              </SidebarItem>
            ) : null}
            {isAdmin ? (
              <SidebarItem href="/admin">
                <Badge color="emerald">Admin</Badge>
                <SidebarLabel>Admin</SidebarLabel>
              </SidebarItem>
            ) : null}
          </SidebarSection>
        ) : null}
      </SidebarBody>

      <SidebarFooter>
        <SidebarSection>
          {user ? (
            <SidebarItem onClick={handleSignOut}>
              <SidebarLabel>Sign out</SidebarLabel>
            </SidebarItem>
          ) : (
            <Button href="/signup" color="emerald" className="w-full">
              Join Rack Up
            </Button>
          )}
        </SidebarSection>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function PublicShell({ children, contentClassName }: PublicShellProps) {
  return (
    <StackedLayout
      className="bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white"
      navbar={<PublicNavbar />}
      sidebar={<PublicSidebar />}
    >
      <div className={clsx("mx-auto w-full max-w-6xl space-y-10", contentClassName)}>{children}</div>
    </StackedLayout>
  );
}
