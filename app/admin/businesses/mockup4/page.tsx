"use client";

/**
 * MOCKUP 4: Dashboard with Inline Expansion
 *
 * Layout: A clean dashboard approach. Top row has summary stat cards
 * (total businesses, total locations, active causes, staff).
 * Below that is a search bar + "New Business" button, followed by
 * a list of business "rows" that expand inline to show a mini-dashboard
 * for that business with a horizontal card layout for Locations, Causes,
 * Logos, Staff, and Donation URLs.
 *
 * Each business row has an action menu (three-dot) for quick operations.
 *
 * Design rationale:
 * - Summary stats at the top give immediate situational awareness
 * - List-based layout is more scannable than cards for 10+ businesses
 * - Inline expansion means no context switching (no modals/separate pages)
 * - Horizontal card sections within the expansion avoid deep vertical scrolling
 * - Action menu keeps the row clean while offering quick access to operations
 */

import React, { useState } from "react";

const STATS = [
  { label: "Businesses", value: "4", change: "+1 this month" },
  { label: "Locations", value: "10", change: "+3 this month" },
  { label: "Active Causes", value: "6", change: "" },
  { label: "Staff Members", value: "8", change: "" },
];

const MOCK_BUSINESSES = [
  {
    id: "joes-pizza",
    name: "Joe's Pizza",
    slug: "joes-pizza",
    locations: ["Downtown", "Uptown", "Midtown"],
    causes: ["Clean Water", "Food Bank"],
    hasLogo: true,
    active: true,
    staffCount: 2,
  },
  {
    id: "green-cafe",
    name: "Green Cafe",
    slug: "green-cafe",
    locations: ["Main St"],
    causes: ["Tree Planting"],
    hasLogo: false,
    active: true,
    staffCount: 0,
  },
  {
    id: "sunrise-bakery",
    name: "Sunrise Bakery",
    slug: "sunrise-bakery",
    locations: ["Harbor", "Airport"],
    causes: [],
    hasLogo: true,
    active: false,
    staffCount: 1,
  },
  {
    id: "metro-gym",
    name: "Metro Gym",
    slug: "metro-gym",
    locations: ["West End", "East Side", "Central", "University"],
    causes: ["Youth Sports", "Mental Health", "Fitness Access"],
    hasLogo: true,
    active: true,
    staffCount: 5,
  },
];

export default function Mockup4() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const filtered = MOCK_BUSINESSES.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Admin
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Business Management
        </h1>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {stat.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-white">{stat.value}</div>
            {stat.change && (
              <div className="mt-0.5 text-xs text-emerald-400">{stat.change}</div>
            )}
          </div>
        ))}
      </div>

      {/* Search + Action Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(!showNewForm)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400"
        >
          + New Business
        </button>
      </div>

      {/* Inline Create Form */}
      {showNewForm && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-emerald-300">
            Create New Business
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Business name"
            />
            <input
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                placeholder="slug (auto)"
              />
              <button
                type="button"
                className="h-10 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Business List */}
      <div className="space-y-2">
        {filtered.map((biz) => {
          const isExpanded = expandedId === biz.id;
          return (
            <div
              key={biz.id}
              className={`rounded-xl border transition ${
                isExpanded
                  ? "border-emerald-400/20 bg-white/[0.03]"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10"
              }`}
            >
              {/* Row Header */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : biz.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left"
              >
                {/* Logo */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    biz.hasLogo
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {biz.name.charAt(0)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{biz.name}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        biz.active
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {biz.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-zinc-500">/{biz.slug}</div>
                </div>

                {/* Quick stats */}
                <div className="hidden items-center gap-6 text-xs text-zinc-500 sm:flex">
                  <div className="text-center">
                    <div className="font-semibold text-zinc-300">{biz.locations.length}</div>
                    <div>locations</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-zinc-300">{biz.causes.length}</div>
                    <div>causes</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-zinc-300">{biz.staffCount}</div>
                    <div>staff</div>
                  </div>
                </div>

                {/* Expand indicator */}
                <svg
                  className={`h-4 w-4 shrink-0 text-zinc-500 transition ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-white/5 px-5 py-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {/* Locations Card */}
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          Locations
                        </h4>
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          + Add
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {biz.locations.map((loc) => (
                          <div
                            key={loc}
                            className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                          >
                            <span className="text-sm text-white">{loc}</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-zinc-400 hover:text-white"
                              >
                                Logo
                              </button>
                              <button
                                type="button"
                                className="text-xs text-emerald-300 hover:text-emerald-200"
                              >
                                QR
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Causes Card */}
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          Linked Causes
                        </h4>
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          + Assign
                        </button>
                      </div>
                      {biz.causes.length === 0 ? (
                        <p className="py-4 text-center text-xs text-zinc-600">No causes linked</p>
                      ) : (
                        <div className="space-y-1.5">
                          {biz.causes.map((cause) => (
                            <div
                              key={cause}
                              className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                            >
                              <span className="text-sm text-white">{cause}</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="text-xs text-emerald-300 hover:text-emerald-200"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-red-400 hover:text-red-300"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Actions Card */}
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        Quick Actions
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                          </svg>
                          Upload Logo
                        </button>
                        <button
                          type="button"
                          className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                          </svg>
                          Manage Staff
                        </button>
                        <button
                          type="button"
                          className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                          </svg>
                          Print QR
                        </button>
                        <button
                          type="button"
                          className="flex flex-col items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-zinc-300 transition hover:border-white/15 hover:text-white"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-5.188a4.5 4.5 0 00-6.364-6.364L3.75 6.38a4.5 4.5 0 006.364 6.364l4.5-4.5z" />
                          </svg>
                          Donation URLs
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
