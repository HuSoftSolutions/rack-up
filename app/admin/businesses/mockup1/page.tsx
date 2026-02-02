"use client";

/**
 * MOCKUP 1: Tabbed Interface with Data Table
 *
 * Layout: Horizontal tab bar at top with full-width content below.
 * Tabs: All Businesses | Create Business | Add Location | Assign Causes | Upload Logos | Manage Staff
 *
 * The "All Businesses" tab features a searchable data table showing every
 * business with columns for Name, Slug, Locations, Causes, Logo, Status, and Actions.
 * Rows expand inline to reveal location details and quick-action buttons.
 *
 * Design rationale:
 * - Puts the business overview front-and-center so admins can see everything at a glance
 * - Each tab maps to one task, reducing cognitive load vs the current page
 * - The data table scales well from a handful to hundreds of businesses
 * - Inline row expansion keeps context without navigating away
 */

import React, { useState } from "react";

const TABS = [
  "All Businesses",
  "Create Business",
  "Add Location",
  "Assign Causes",
  "Upload Logos",
  "Manage Staff",
] as const;
type Tab = (typeof TABS)[number];

const MOCK_BUSINESSES = [
  {
    id: "joes-pizza",
    name: "Joe's Pizza",
    slug: "joes-pizza",
    locations: ["Downtown", "Uptown", "Midtown"],
    causes: ["Clean Water", "Food Bank"],
    hasLogo: true,
    active: true,
  },
  {
    id: "green-cafe",
    name: "Green Cafe",
    slug: "green-cafe",
    locations: ["Main St"],
    causes: ["Tree Planting"],
    hasLogo: false,
    active: true,
  },
  {
    id: "sunrise-bakery",
    name: "Sunrise Bakery",
    slug: "sunrise-bakery",
    locations: ["Harbor", "Airport"],
    causes: [],
    hasLogo: true,
    active: false,
  },
];

export default function Mockup1() {
  const [activeTab, setActiveTab] = useState<Tab>("All Businesses");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = MOCK_BUSINESSES.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Admin
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Businesses & Locations
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage businesses, locations, cause assignments, logos, and staff.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab
                ? "border-b-2 border-emerald-400 text-emerald-300"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "All Businesses" && (
        <div className="space-y-4">
          {/* Search + action bar */}
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
                className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                placeholder="Search businesses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("Create Business")}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              <span className="text-lg leading-none">+</span> New Business
            </button>
          </div>

          {/* Data Table */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium text-center">Locations</th>
                  <th className="px-4 py-3 font-medium text-center">Causes</th>
                  <th className="px-4 py-3 font-medium text-center">Logo</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((biz) => (
                  <React.Fragment key={biz.id}>
                    <tr
                      className="cursor-pointer transition hover:bg-white/[0.04]"
                      onClick={() =>
                        setExpandedRow(expandedRow === biz.id ? null : biz.id)
                      }
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {biz.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                        {biz.slug}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-300">
                        {biz.locations.length}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-300">
                        {biz.causes.length}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {biz.hasLogo ? (
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            biz.active
                              ? "bg-emerald-400/20 text-emerald-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {biz.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                        >
                          {expandedRow === biz.id ? "Collapse" : "Expand"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {expandedRow === biz.id && (
                      <tr>
                        <td colSpan={7} className="bg-white/[0.02] px-6 py-4">
                          <div className="grid gap-4 md:grid-cols-3">
                            {/* Locations */}
                            <div>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                Locations
                              </h4>
                              <div className="space-y-1">
                                {biz.locations.map((loc) => (
                                  <div
                                    key={loc}
                                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                                  >
                                    <span className="text-sm text-white">{loc}</span>
                                    <button
                                      type="button"
                                      className="text-xs text-emerald-300 hover:underline"
                                    >
                                      Print QR
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Causes */}
                            <div>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                Linked Causes
                              </h4>
                              {biz.causes.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {biz.causes.map((c) => (
                                    <span
                                      key={c}
                                      className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-500">No causes linked.</p>
                              )}
                            </div>
                            {/* Quick Actions */}
                            <div>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                Quick Actions
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                                >
                                  Upload Logo
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                                >
                                  Add Location
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                                >
                                  Manage Staff
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                                >
                                  Assign Causes
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Create Business" && (
        <div className="mx-auto max-w-lg">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Create a new business</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Fill in the details below to register a new business.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">
                  Business name
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  placeholder="e.g. Joe's Pizza"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">
                  Description{" "}
                  <span className="text-zinc-500">(optional)</span>
                </span>
                <textarea
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  rows={3}
                  placeholder="Brief description of the business"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">
                  Slug <span className="text-zinc-500">(optional)</span>
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  placeholder="auto-generated from name"
                />
              </label>
              <button
                type="button"
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Create Business
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Add Location" && (
        <div className="mx-auto max-w-lg">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Add a location</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Attach a new location to an existing business.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Business</span>
                <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40">
                  <option>Select a business...</option>
                  <option>Joe&apos;s Pizza</option>
                  <option>Green Cafe</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Location name</span>
                <input
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  placeholder="e.g. Downtown"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">
                  Slug <span className="text-zinc-500">(optional)</span>
                </span>
                <input
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  placeholder="auto-generated from name"
                />
              </label>
              <button
                type="button"
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                Add Location
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Assign Causes" && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Assign causes to locations</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Select a business, then link causes to specific locations.
            </p>
            <div className="mt-4">
              <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40">
                <option>Select a business...</option>
                <option>Joe&apos;s Pizza</option>
                <option>Green Cafe</option>
              </select>
            </div>
          </div>
          {/* Cause cards */}
          {["Clean Water", "Food Bank"].map((cause) => (
            <div
              key={cause}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{cause}</h3>
                  <p className="text-xs text-zinc-400">
                    Linked to 3 locations
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Downtown", "Uptown", "Midtown"].map((loc, i) => (
                  <label
                    key={loc}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                      i < 2
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
                    }`}
                  >
                    <input type="checkbox" className="hidden" defaultChecked={i < 2} />
                    {loc}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "Upload Logos" && (
        <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Business Logo</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Upload or replace the logo for a business.
            </p>
            <div className="mt-4 space-y-3">
              <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
                <option>Select a business...</option>
              </select>
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-white/10 text-sm text-zinc-500">
                Drag & drop or click to upload
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Upload Logo
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Location Logo</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Upload or replace the logo for a specific location.
            </p>
            <div className="mt-4 space-y-3">
              <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
                <option>Select a business...</option>
              </select>
              <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
                <option>Select a location...</option>
              </select>
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-white/10 text-sm text-zinc-500">
                Drag & drop or click to upload
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Upload Logo
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Manage Staff" && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20">
            <h2 className="text-lg font-semibold text-white">Manage Staff</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Grant access to business staff members.
            </p>
            <div className="mt-4 space-y-3">
              <select className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
                <option>Select a business...</option>
              </select>
              <input
                className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                placeholder="user@example.com"
              />
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-2 text-zinc-300">
                  <input type="radio" name="mock-role" defaultChecked className="accent-emerald-400" />
                  Staff
                </label>
                <label className="inline-flex items-center gap-2 text-zinc-300">
                  <input type="radio" name="mock-role" className="accent-emerald-400" />
                  Owner
                </label>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Grant Access
              </button>
            </div>
          </div>
          {/* Current staff */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Current Staff
            </h3>
            {[
              { email: "alice@example.com", role: "Owner" },
              { email: "bob@example.com", role: "Staff" },
            ].map((m) => (
              <div
                key={m.email}
                className="flex items-center justify-between border-b border-white/5 py-2 last:border-0"
              >
                <div>
                  <div className="text-sm text-white">{m.email}</div>
                  <div className="text-xs text-zinc-500">{m.role}</div>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
