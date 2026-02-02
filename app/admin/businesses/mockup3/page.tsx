"use client";

/**
 * MOCKUP 3: Card Grid + Modal Detail
 *
 * Layout: A responsive grid of business cards on the main page.
 * Each card shows the business name, description, location/cause counts,
 * logo status, and active state. A "Create Business" card is the first item.
 *
 * Clicking a card opens a full-width modal (dialog) with tabbed sections:
 * Info | Locations | Causes | Logos | Staff
 *
 * Design rationale:
 * - Grid of cards provides an immediate visual overview of all businesses
 * - The "Create" card is always visible, making it easy to add new businesses
 * - Modal keeps the user in context (the grid is still visible behind)
 * - Internal tabs in the modal keep each section focused and manageable
 * - Good for admins managing a moderate number of businesses (5-30)
 */

import React, { useState } from "react";

const MOCK_BUSINESSES = [
  {
    id: "joes-pizza",
    name: "Joe's Pizza",
    description: "Classic NY style pizza since 1975",
    locationCount: 3,
    causeCount: 2,
    staffCount: 2,
    hasLogo: true,
    active: true,
  },
  {
    id: "green-cafe",
    name: "Green Cafe",
    description: "Sustainable coffee and light fare",
    locationCount: 1,
    causeCount: 1,
    staffCount: 0,
    hasLogo: false,
    active: true,
  },
  {
    id: "sunrise-bakery",
    name: "Sunrise Bakery",
    description: "Fresh bread and pastries daily",
    locationCount: 2,
    causeCount: 0,
    staffCount: 1,
    hasLogo: true,
    active: false,
  },
  {
    id: "metro-gym",
    name: "Metro Gym",
    description: "Fitness for everyone",
    locationCount: 4,
    causeCount: 3,
    staffCount: 5,
    hasLogo: true,
    active: true,
  },
];

const MODAL_TABS = ["Info", "Locations", "Causes", "Logos", "Staff"] as const;
type ModalTab = (typeof MODAL_TABS)[number];

export default function Mockup3() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>("Info");

  const selected = MOCK_BUSINESSES.find((b) => b.id === selectedId);

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Admin
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Businesses</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Click a business to manage its locations, causes, logos, and staff.
          </p>
        </div>
        <div className="text-sm text-zinc-500">
          {MOCK_BUSINESSES.length} businesses
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Create Business Card */}
        <button
          type="button"
          className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/10 bg-transparent px-6 py-10 text-center transition hover:border-emerald-400/40 hover:bg-emerald-500/5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/20 text-2xl text-zinc-500 transition group-hover:border-emerald-400/40 group-hover:text-emerald-400">
            +
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-400 group-hover:text-emerald-300">
              Create Business
            </div>
            <div className="text-xs text-zinc-600">
              Register a new business
            </div>
          </div>
        </button>

        {/* Business Cards */}
        {MOCK_BUSINESSES.map((biz) => (
          <button
            key={biz.id}
            type="button"
            onClick={() => {
              setSelectedId(biz.id);
              setModalTab("Info");
            }}
            className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
          >
            {/* Status dot */}
            <div className="absolute right-4 top-4">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  biz.active ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
            </div>

            {/* Logo placeholder */}
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${
                biz.hasLogo
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {biz.name.charAt(0)}
            </div>

            <h3 className="text-base font-semibold text-white">{biz.name}</h3>
            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
              {biz.description}
            </p>

            {/* Stats row */}
            <div className="mt-4 flex items-center gap-4 border-t border-white/5 pt-3 text-xs text-zinc-500">
              <span>{biz.locationCount} locations</span>
              <span>{biz.causeCount} causes</span>
              <span>{biz.staffCount} staff</span>
            </div>

            {/* Hover arrow */}
            <div className="absolute bottom-5 right-5 text-zinc-600 opacity-0 transition group-hover:opacity-100">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Modal Overlay */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-12 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${
                    selected.hasLogo
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {selected.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  <p className="text-sm text-zinc-400">{selected.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-white/10 px-6">
              {MODAL_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setModalTab(tab)}
                  className={`px-4 py-3 text-sm font-medium transition ${
                    modalTab === tab
                      ? "border-b-2 border-emerald-400 text-emerald-300"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="px-6 py-5">
              {modalTab === "Info" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-zinc-300">Name</span>
                      <input
                        className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400"
                        defaultValue={selected.name}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-zinc-300">Slug</span>
                      <input
                        className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white outline-none focus:border-emerald-400"
                        defaultValue={selected.id}
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-300">Description</span>
                    <textarea
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      rows={3}
                      defaultValue={selected.description}
                    />
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                      <input type="checkbox" className="accent-emerald-400" defaultChecked={selected.active} />
                      Active
                    </label>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    Save Changes
                  </button>
                </div>
              )}

              {modalTab === "Locations" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">
                      {selected.locationCount} location{selected.locationCount !== 1 && "s"}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      + Add Location
                    </button>
                  </div>
                  {["Downtown", "Uptown", "Midtown"].slice(0, selected.locationCount).map((loc) => (
                    <div
                      key={loc}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{loc}</div>
                        <div className="text-xs text-zinc-500">Active</div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="text-xs text-emerald-300 hover:text-emerald-200">
                          Print QR
                        </button>
                        <button type="button" className="text-xs text-zinc-400 hover:text-white">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {modalTab === "Causes" && (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">
                    Assign causes and select which locations they appear at.
                  </p>
                  {selected.causeCount === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] py-10 text-center">
                      <p className="text-sm text-zinc-500">No causes linked yet.</p>
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                      >
                        Assign First Cause
                      </button>
                    </div>
                  ) : (
                    <>
                      {["Clean Water", "Food Bank"].slice(0, selected.causeCount).map((cause) => (
                        <div
                          key={cause}
                          className="rounded-lg border border-white/5 bg-white/[0.03] p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">{cause}</div>
                            <div className="flex gap-2">
                              <button type="button" className="text-xs text-emerald-300 hover:text-emerald-200">
                                Save
                              </button>
                              <button type="button" className="text-xs text-red-400 hover:text-red-300">
                                Remove
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {["Downtown", "Uptown", "Midtown"].map((loc, i) => (
                              <label
                                key={loc}
                                className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs ${
                                  i < 2
                                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                    : "border-white/10 text-zinc-400"
                                }`}
                              >
                                <input type="checkbox" className="hidden" defaultChecked={i < 2} />
                                {loc}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {modalTab === "Logos" && (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-white">Business Logo</h3>
                    <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/10 text-center">
                      {selected.hasLogo ? (
                        <>
                          <div className="text-3xl font-bold text-emerald-300">
                            {selected.name.charAt(0)}
                          </div>
                          <span className="text-xs text-zinc-500">Current logo</span>
                        </>
                      ) : (
                        <span className="text-xs text-zinc-500">No logo uploaded</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-emerald-500 text-xs font-semibold text-white hover:bg-emerald-400"
                    >
                      {selected.hasLogo ? "Replace Logo" : "Upload Logo"}
                    </button>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-white">Location Logos</h3>
                    <div className="space-y-2">
                      {["Downtown", "Uptown", "Midtown"].slice(0, selected.locationCount).map((loc, i) => (
                        <div
                          key={loc}
                          className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-6 w-6 rounded text-center text-xs font-bold leading-6 ${
                                i % 2 === 0
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-zinc-800 text-zinc-500"
                              }`}
                            >
                              {loc.charAt(0)}
                            </div>
                            <span className="text-xs text-white">{loc}</span>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-emerald-300 hover:text-emerald-200"
                          >
                            Upload
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === "Staff" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      className="h-10 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400"
                      placeholder="user@example.com"
                    />
                    <select className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-emerald-400">
                      <option>Staff</option>
                      <option>Owner</option>
                    </select>
                    <button
                      type="button"
                      className="h-10 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400"
                    >
                      Add
                    </button>
                  </div>
                  {selected.staffCount > 0 ? (
                    <div className="divide-y divide-white/5 rounded-lg border border-white/5">
                      {[
                        { email: "owner@example.com", role: "Owner" },
                        { email: "staff@example.com", role: "Staff" },
                      ]
                        .slice(0, selected.staffCount)
                        .map((m) => (
                          <div
                            key={m.email}
                            className="flex items-center justify-between px-4 py-3"
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
                  ) : (
                    <p className="text-sm text-zinc-500">No staff members yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
