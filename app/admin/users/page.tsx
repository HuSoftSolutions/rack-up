"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

type AdminUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  businessAdmin: { businessId: string | null; role: string | null } | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let canceled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { users?: AdminUser[]; error?: string };
        if (!res.ok || !json.users) {
          throw new Error(json.error ?? "Failed to load users.");
        }
        if (!canceled) {
          setUsers(json.users);
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : "Failed to load users.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [user]);

  const counts = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter((u) => u.isAdmin).length,
      staff: users.filter((u) => u.businessAdmin).length,
    };
  }, [users]);

  return (
    <div className="space-y-4 text-white">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1 text-sm text-zinc-300">List of registered users and their roles.</p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total users" value={counts.total} />
        <StatCard label="Admins" value={counts.admins} />
        <StatCard label="Business staff" value={counts.staff} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-medium">
          <div>Users</div>
          <div className="text-xs text-zinc-400">
            {loading ? "Loading…" : `${users.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm text-white">
            <thead className="sticky top-0 border-b border-white/10 bg-white/5 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Roles</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-3 text-zinc-400" colSpan={4}>
                    No users found.
                  </td>
                </tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.uid} className="border-b border-white/5 text-sm">
                  <td className="px-4 py-2">
                    <div className="font-medium text-white">{u.email ?? "—"}</div>
                    <div className="text-xs text-zinc-400">{u.uid}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{u.displayName ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-200">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {u.isAdmin ? (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 font-medium">
                          Admin
                        </span>
                      ) : null}
                      {u.businessAdmin ? (
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 font-medium text-blue-200">
                          {u.businessAdmin.role ?? "staff"} · {u.businessAdmin.businessId ?? "—"}
                        </span>
                      ) : null}
                      {!u.isAdmin && !u.businessAdmin ? (
                        <span className="rounded-full border border-white/15 px-2 py-1 font-medium text-white">
                          User
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
