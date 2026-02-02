"use client";

/**
 * MOCKUP 5: Two-Panel Command Center
 *
 * Layout: Full-width page split into two main zones.
 *
 * TOP ZONE: A compact toolbar with business selector dropdown, action
 * buttons (Add Location, Assign Cause, Upload Logo, Manage Staff), and
 * a "New Business" button. This acts as a persistent command bar.
 *
 * BOTTOM ZONE: Two equal columns.
 *   Left column: Selected business detail card with editable info, plus
 *   a locations list with inline add and per-location actions.
 *   Right column: Linked causes with location checkboxes, donation URLs,
 *   and QR print links.
 *
 * Design rationale:
 * - The toolbar keeps all actions one click away, no hunting through tabs
 * - Business selector in the toolbar is always visible for quick switching
 * - Two-column detail view groups related info (business+locations vs.
 *   causes+donations) without overloading either side
 * - Keeps the current page's "everything on one screen" philosophy but
 *   with much better organization and visual hierarchy
 * - Best for power users who want density and minimal clicks
 */

import React, { useState } from "react";

const MOCK_BUSINESSES = [
  {
    id: "joes-pizza",
    name: "Joe's Pizza",
    slug: "joes-pizza",
    description: "Classic New York style pizza since 1975",
    active: true,
    hasLogo: true,
    locations: [
      { id: "downtown", name: "Downtown", active: true, hasLogo: true },
      { id: "uptown", name: "Uptown", active: true, hasLogo: false },
      { id: "midtown", name: "Midtown", active: true, hasLogo: true },
    ],
    causes: [
      {
        id: "clean-water",
        title: "Clean Water",
        description: "Providing clean water access globally",
        locationIds: ["downtown", "uptown", "midtown"],
      },
      {
        id: "food-bank",
        title: "Food Bank",
        description: "Supporting local food banks",
        locationIds: ["downtown", "uptown"],
      },
    ],
    staff: [
      { email: "joe@pizza.com", role: "Owner" },
      { email: "maria@pizza.com", role: "Staff" },
    ],
  },
  {
    id: "green-cafe",
    name: "Green Cafe",
    slug: "green-cafe",
    description: "Sustainable coffee and light fare",
    active: true,
    hasLogo: false,
    locations: [{ id: "main-st", name: "Main St", active: true, hasLogo: false }],
    causes: [
      {
        id: "tree-planting",
        title: "Tree Planting",
        description: "Plant a tree with every purchase",
        locationIds: ["main-st"],
      },
    ],
    staff: [],
  },
];

export default function Mockup5() {
  const [selectedId, setSelectedId] = useState(MOCK_BUSINESSES[0].id);
  const [showNewBiz, setShowNewBiz] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showStaff, setShowStaff] = useState(false);

  const biz = MOCK_BUSINESSES.find((b) => b.id === selectedId)!;

  return (
    <div className="space-y-4 text-white">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Admin
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Business Command Center
        </h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        {/* Business Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Business:
          </span>
          <select
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-medium text-white outline-none focus:border-emerald-400"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {MOCK_BUSINESSES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-white/10 sm:block" />

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddLocation(!showAddLocation)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
              showAddLocation
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-zinc-300 hover:text-white"
            }`}
          >
            + Location
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-zinc-300 hover:text-white"
          >
            + Assign Cause
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-zinc-300 hover:text-white"
          >
            Upload Logo
          </button>
          <button
            type="button"
            onClick={() => setShowStaff(!showStaff)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
              showStaff
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-zinc-300 hover:text-white"
            }`}
          >
            Staff ({biz.staff.length})
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* New Business */}
        <button
          type="button"
          onClick={() => setShowNewBiz(!showNewBiz)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-400"
        >
          + New Business
        </button>
      </div>

      {/* Inline New Business Form */}
      {showNewBiz && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-300">Create New Business</h3>
            <button
              type="button"
              onClick={() => setShowNewBiz(false)}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Name"
            />
            <input
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Description"
            />
            <input
              className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="slug (auto)"
            />
            <button
              type="button"
              className="h-10 rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Staff Panel (slides in) */}
      {showStaff && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Staff &mdash; {biz.name}
            </h3>
            <button
              type="button"
              onClick={() => setShowStaff(false)}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="user@example.com"
            />
            <select className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
              <option>Staff</option>
              <option>Owner</option>
            </select>
            <button
              type="button"
              className="h-9 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400"
            >
              Add
            </button>
          </div>
          {biz.staff.length > 0 && (
            <div className="mt-3 divide-y divide-white/5 rounded-lg border border-white/5">
              {biz.staff.map((m) => (
                <div key={m.email} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm text-white">{m.email}</span>
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400">
                      {m.role}
                    </span>
                  </div>
                  <button type="button" className="text-xs text-red-400 hover:text-red-300">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Two-Column Content */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT COLUMN: Business Info + Locations */}
        <div className="space-y-4">
          {/* Business Detail Card */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${
                  biz.hasLogo
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {biz.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{biz.name}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      biz.active
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {biz.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-400">{biz.description}</p>
                <div className="mt-1 font-mono text-xs text-zinc-600">/{biz.slug}</div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-center">
                <div className="text-base font-bold text-white">{biz.locations.length}</div>
                <div className="text-xs text-zinc-500">Locations</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-center">
                <div className="text-base font-bold text-white">{biz.causes.length}</div>
                <div className="text-xs text-zinc-500">Causes</div>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-center">
                <div className="text-base font-bold text-white">{biz.staff.length}</div>
                <div className="text-xs text-zinc-500">Staff</div>
              </div>
            </div>
          </div>

          {/* Locations */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Locations</h3>
              <button
                type="button"
                onClick={() => setShowAddLocation(!showAddLocation)}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                + Add Location
              </button>
            </div>

            {showAddLocation && (
              <div className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                <div className="flex gap-2">
                  <input
                    className="h-9 flex-1 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                    placeholder="Location name"
                  />
                  <input
                    className="h-9 w-28 rounded-md border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                    placeholder="slug"
                  />
                  <button
                    type="button"
                    className="h-9 rounded-md bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {biz.locations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ${
                        loc.hasLogo
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {loc.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{loc.name}</div>
                      <div className="font-mono text-xs text-zinc-600">{loc.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        loc.active ? "bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
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
                      Print QR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Causes + Donation URLs */}
        <div className="space-y-4">
          {/* Linked Causes */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Linked Causes</h3>
              <button
                type="button"
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                + Assign Cause
              </button>
            </div>

            {biz.causes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] py-8 text-center">
                <p className="text-sm text-zinc-500">No causes linked yet.</p>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Assign First Cause
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {biz.causes.map((cause) => (
                  <div
                    key={cause.id}
                    className="rounded-lg border border-white/5 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{cause.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">{cause.description}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-400"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-500/20 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Location toggles */}
                    <div className="mt-3">
                      <div className="mb-1.5 text-xs font-medium text-zinc-500">
                        Active at locations:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {biz.locations.map((loc) => {
                          const active = cause.locationIds.includes(loc.id);
                          return (
                            <span
                              key={loc.id}
                              className={`inline-flex cursor-pointer rounded-md border px-2.5 py-1 text-xs transition ${
                                active
                                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                  : "border-white/10 text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {loc.name}
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          className="rounded-md border border-dashed border-white/10 px-2.5 py-1 text-xs text-zinc-500 hover:text-white"
                        >
                          Select all
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Donation URLs */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">
              Donation URLs
            </h3>
            {biz.causes.length === 0 ? (
              <p className="text-sm text-zinc-500">Link causes to see donation URLs.</p>
            ) : (
              <div className="space-y-2">
                {biz.causes.flatMap((cause) =>
                  biz.locations
                    .filter((loc) => cause.locationIds.includes(loc.id))
                    .map((loc) => (
                      <div
                        key={`${cause.id}-${loc.id}`}
                        className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2"
                      >
                        <div>
                          <div className="text-xs text-zinc-500">
                            {cause.title} &middot; {loc.name}
                          </div>
                          <div className="font-mono text-xs text-emerald-300/70">
                            /donate/{biz.slug}/{cause.id}/{loc.id}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-zinc-400 hover:text-white"
                        >
                          Copy
                        </button>
                      </div>
                    )),
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-zinc-600">
              QR tokens are required for donations. Use Print QR on each location to generate secure links.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
