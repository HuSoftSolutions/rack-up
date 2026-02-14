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
import { LocationScopeProvider, useLocationScope } from "./location-scope";

type NavItem = { href: (businessId: string) => string; label: string };

const quickActions: NavItem[] = [
  { href: (id) => `/biz/${id}`, label: "Dashboard" },
  { href: (id) => `/biz/${id}/redeem`, label: "Redeem" },
];

const manageItems: NavItem[] = [
  { href: (id) => `/biz/${id}/offers`, label: "Offers" },
  { href: (id) => `/biz/${id}/donations`, label: "Donations" },
  { href: (id) => `/biz/${id}/charities`, label: "Charities" },
  { href: (id) => `/biz/${id}/locations`, label: "Locations" },
];

function isCurrent(pathname: string, href: string, businessId: string) {
  // Dashboard is exact match only (so /biz/[id]/redeem doesn't highlight Dashboard)
  if (href === `/biz/${businessId}`) return pathname === href;
  return pathname.startsWith(href);
}

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
  const { role, locations, locationId, setLocationId, loading } = useLocationScope();
  const showSelector = role === "staff" ? locations.length > 1 : locations.length > 0;
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
      {showSelector ? (
        <NavbarSection>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Location</span>
            <select
              className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400"
              value={locationId ?? "__all__"}
              onChange={(event) => {
                const value = event.target.value;
                setLocationId(value === "__all__" ? null : value);
              }}
              disabled={loading}
            >
              {role !== "staff" ? (
                <option value="__all__">All locations</option>
              ) : null}
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name ?? loc.label ?? loc.id}
                </option>
              ))}
            </select>
          </div>
        </NavbarSection>
      ) : null}
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
          <SidebarHeading>Quick Actions</SidebarHeading>
          {quickActions.map((item) => {
            const href = item.href(businessId);
            return (
              <SidebarItem key={href} href={href} current={isCurrent(pathname, href, businessId)}>
                <SidebarLabel>{item.label}</SidebarLabel>
              </SidebarItem>
            );
          })}
        </SidebarSection>
        <SidebarSection>
          <SidebarHeading>Manage</SidebarHeading>
          {manageItems.map((item) => {
            const href = item.href(businessId);
            return (
              <SidebarItem key={href} href={href} current={isCurrent(pathname, href, businessId)}>
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

function LocationScopeBanner() {
  const { role, locations, locationId, setLocationId, loading } = useLocationScope();
  const showSelector = role === "staff" ? locations.length > 1 : locations.length > 0;
  const label =
    role === "staff"
      ? locations.find((loc) => loc.id === locationId)?.name ?? locations[0]?.name ?? "Location"
      : locationId
        ? locations.find((loc) => loc.id === locationId)?.name ?? "Location"
        : "All locations";

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-400">
        Loading locations…
      </div>
    );
  }

  if (!showSelector) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-200">
        Viewing: <span className="font-semibold text-white">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-200">
      <span className="uppercase tracking-wide text-zinc-400">Viewing location</span>
      <select
        className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400"
        value={locationId ?? "__all__"}
        onChange={(event) => {
          const value = event.target.value;
          setLocationId(value === "__all__" ? null : value);
        }}
        disabled={loading}
      >
        {role !== "staff" ? (
          <option value="__all__">All locations</option>
        ) : null}
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name ?? loc.label ?? loc.id}
          </option>
        ))}
      </select>
    </div>
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
  const { membership, loading } = useBusinessAccess(resolvedParams?.businessId);
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  useEffect(() => {
    params.then((p) => setResolvedParams(p));
  }, [params]);

  const businessId = resolvedParams?.businessId;

  if (loading || adminLoading || !businessId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200 shadow-lg">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
          Loading business…
        </div>
      </div>
    );
  }

  const canAccess = !!user && (isAdmin || (membership && membership.businessId === businessId));
  const roleLabel = membership?.role ?? (isAdmin ? "admin" : "staff");

  if (!canAccess) {
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

  if (membership?.role === "staff" && (membership.locationIds?.length ?? 0) === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-zinc-200 shadow-sm">
          <Heading level={2} className="text-lg font-semibold text-white">
            Location access required
          </Heading>
          <Text className="mt-2 text-zinc-300">
            Your staff account needs a location assigned before you can access the business
            console. Contact an admin to update your access.
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
    <LocationScopeProvider businessId={businessId} membership={membership ?? null} isAdmin={!!isAdmin}>
      <SidebarLayout
        className="bg-gradient-to-b from-black via-zinc-950 to-[#0b0b0f] text-white"
        mainClassName="pt-0 pb-0 lg:pt-0 lg:pr-0 lg:pl-64"
        frameClassName="p-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 dark:lg:bg-transparent"
        navbar={
          <BusinessNavbar
            businessId={businessId}
            membershipRole={roleLabel}
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
            role={roleLabel}
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
        <div className="space-y-4">
          <LocationScopeBanner />
          {children}
        </div>
      </SidebarLayout>
    </LocationScopeProvider>
  );
}
