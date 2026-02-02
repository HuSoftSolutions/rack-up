"use client";

/**
 * MOCKUP 2: Master-Detail Split Panel
 *
 * Layout: Persistent left panel listing all businesses (like a mail client),
 * with a right detail panel showing the selected business's full info.
 *
 * Left panel: Searchable business list with status badges and location counts.
 * Right panel: Business header with logo, then vertically stacked collapsible
 * sections for Locations, Causes, Logo Upload, Staff, and QR/Donation URLs.
 *
 * A floating "+" button at the bottom-right opens an inline create form at the
 * top of the left panel.
 *
 * Design rationale:
 * - Business-centric navigation: everything is organized around a single
 *   selected business, which is the natural mental model
 * - Collapsible sections keep the detail panel scannable
 * - Persistent list on the left allows quick switching between businesses
 * - The detail panel can be scrolled independently from the list
 */

import React, { useState } from "react";

const MOCK_BUSINESSES = [
  {
    id: "joes-pizza",
    name: "Joe's Pizza",
    slug: "joes-pizza",
    description: "Classic New York style pizza since 1975",
    locations: [
      { id: "downtown", name: "Downtown", hasLogo: true },
      { id: "uptown", name: "Uptown", hasLogo: false },
      { id: "midtown", name: "Midtown", hasLogo: true },
    ],
    causes: [
      { id: "clean-water", title: "Clean Water", locationCount: 3 },
      { id: "food-bank", title: "Food Bank", locationCount: 2 },
    ],
    hasLogo: true,
    active: true,
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
    locations: [{ id: "main-st", name: "Main St", hasLogo: false }],
    causes: [{ id: "tree-planting", title: "Tree Planting", locationCount: 1 }],
    hasLogo: false,
    active: true,
    staff: [],
  },
  {
    id: "sunrise-bakery",
    name: "Sunrise Bakery",
    slug: "sunrise-bakery",
    description: "Fresh bread and pastries daily",
    locations: [
      { id: "harbor", name: "Harbor", hasLogo: false },
      { id: "airport", name: "Airport", hasLogo: true },
    ],
    causes: [],
    hasLogo: true,
    active: false,
    staff: [{ email: "sun@bakery.com", role: "Owner" }],
  },
];

type Section = "locations" | "causes" | "logos" | "staff" | "urls";

export default function Mockup2() {
  const [selectedId, setSelectedId] = useState(MOCK_BUSINESSES[0].id);
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(["locations"]),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);

  const selected = MOCK_BUSINESSES.find((b) => b.id === selectedId)!;
  const filtered = MOCK_BUSINESSES.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleSection(s: Section) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-2xl border border-white/10">
      {/* Left Panel - Business List */}
      <div className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/10 p-3">
          <input
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showCreateForm && (
          <div className="border-b border-white/10 bg-emerald-500/5 p-3">
            <div className="mb-2 text-xs font-semibold text-emerald-300">
              New Business
            </div>
            <input
              className="mb-2 h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Business name"
            />
            <input
              className="mb-2 h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md bg-emerald-500 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filtered.map((biz) => (
            <button
              key={biz.id}
              type="button"
              onClick={() => setSelectedId(biz.id)}
              className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition ${
                selectedId === biz.id
                  ? "bg-emerald-500/10 border-l-2 border-l-emerald-400"
                  : "hover:bg-white/[0.03]"
              }`}
            >
              {/* Logo placeholder */}
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  biz.hasLogo
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {biz.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">
                    {biz.name}
                  </span>
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      biz.active ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                </div>
                <div className="text-xs text-zinc-500">
                  {biz.locations.length} location{biz.locations.length !== 1 && "s"}
                  {" · "}
                  {biz.causes.length} cause{biz.causes.length !== 1 && "s"}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Floating create button */}
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
          >
            <span className="text-lg leading-none">+</span> New Business
          </button>
        </div>
      </div>

      {/* Right Panel - Business Detail */}
      <div className="flex-1 overflow-y-auto bg-white/[0.01]">
        {/* Business Header */}
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{selected.name}</h1>
              <p className="mt-0.5 text-sm text-zinc-400">{selected.description}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <span className="font-mono">/{selected.slug}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                    selected.active
                      ? "bg-emerald-400/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {selected.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold ${
                selected.hasLogo
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {selected.name.charAt(0)}
            </div>
          </div>
          {/* Quick stats */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { label: "Locations", value: selected.locations.length },
              { label: "Causes", value: selected.causes.length },
              { label: "Staff", value: selected.staff.length },
              { label: "Logo", value: selected.hasLogo ? "Yes" : "No" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-center"
              >
                <div className="text-lg font-bold text-white">{stat.value}</div>
                <div className="text-xs text-zinc-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Collapsible sections */}
        <div className="divide-y divide-white/5">
          {/* Locations */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("locations")}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-white">Locations</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400">
                  {selected.locations.length}
                </span>
              </div>
              <span className="text-zinc-500">{openSections.has("locations") ? "−" : "+"}</span>
            </button>
            {openSections.has("locations") && (
              <div className="px-6 pb-4">
                <div className="space-y-2">
                  {selected.locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2.5"
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
                          <div className="font-mono text-xs text-zinc-500">{loc.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:text-white"
                        >
                          Upload Logo
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
                        >
                          Print QR
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  <span>+</span> Add Location
                </button>
              </div>
            )}
          </div>

          {/* Causes */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("causes")}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-white">Linked Causes</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400">
                  {selected.causes.length}
                </span>
              </div>
              <span className="text-zinc-500">{openSections.has("causes") ? "−" : "+"}</span>
            </button>
            {openSections.has("causes") && (
              <div className="px-6 pb-4">
                {selected.causes.length === 0 ? (
                  <p className="text-sm text-zinc-500">No causes linked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.causes.map((cause) => (
                      <div
                        key={cause.id}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-4 py-2.5"
                      >
                        <div>
                          <div className="text-sm font-medium text-white">{cause.title}</div>
                          <div className="text-xs text-zinc-500">
                            {cause.locationCount} location{cause.locationCount !== 1 && "s"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  <span>+</span> Assign Cause
                </button>
              </div>
            )}
          </div>

          {/* Logos */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("logos")}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02]"
            >
              <span className="text-sm font-semibold text-white">Business Logo</span>
              <span className="text-zinc-500">{openSections.has("logos") ? "−" : "+"}</span>
            </button>
            {openSections.has("logos") && (
              <div className="px-6 pb-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-white/10 text-zinc-500">
                    {selected.hasLogo ? (
                      <span className="text-2xl font-bold text-emerald-300">
                        {selected.name.charAt(0)}
                      </span>
                    ) : (
                      <span className="text-xs">No logo</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      Upload New Logo
                    </button>
                    <p className="text-xs text-zinc-500">
                      {selected.hasLogo ? "Logo on file. Upload to replace." : "No logo uploaded yet."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Staff */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("staff")}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-white">Staff</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400">
                  {selected.staff.length}
                </span>
              </div>
              <span className="text-zinc-500">{openSections.has("staff") ? "−" : "+"}</span>
            </button>
            {openSections.has("staff") && (
              <div className="px-6 pb-4">
                {selected.staff.map((m) => (
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
                <div className="mt-3 flex items-center gap-2">
                  <input
                    className="h-8 flex-1 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                    placeholder="user@example.com"
                  />
                  <select className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-emerald-400">
                    <option>Staff</option>
                    <option>Owner</option>
                  </select>
                  <button
                    type="button"
                    className="h-8 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Donation URLs */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection("urls")}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02]"
            >
              <span className="text-sm font-semibold text-white">Donation URLs</span>
              <span className="text-zinc-500">{openSections.has("urls") ? "−" : "+"}</span>
            </button>
            {openSections.has("urls") && (
              <div className="px-6 pb-4">
                {selected.causes.length === 0 ? (
                  <p className="text-sm text-zinc-500">Link causes to generate donation URLs.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.causes.flatMap((cause) =>
                      selected.locations.map((loc) => (
                        <div
                          key={`${cause.id}-${loc.id}`}
                          className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                        >
                          <div className="text-xs text-zinc-500">
                            {cause.title} · {loc.name}
                          </div>
                          <div className="font-mono text-xs text-emerald-300">
                            /donate/{selected.slug}/{cause.id}/{loc.id}
                          </div>
                        </div>
                      )),
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
