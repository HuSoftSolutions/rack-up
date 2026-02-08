"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/ui-kit/button";
import { Input } from "@/ui-kit/input";
import { Select } from "@/ui-kit/select";
import { Switch, SwitchField } from "@/ui-kit/switch";
import { Dialog, DialogActions, DialogBody, DialogTitle } from "@/ui-kit/dialog";

type AdminUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  createdAt: string | null;
  isAdmin: boolean;
  businessAdmin: { businessId: string | null; role: string | null } | null;
};

type BusinessOption = {
  id: string;
  name: string;
  slug: string;
  locations: { id: string; name: string; slug: string }[];
};

type InviteResult = {
  status: "created" | "existing";
  actionLink: string | null;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    isAdmin: boolean;
    businessAdmin: { businessId: string | null; role: string | null } | null;
  };
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [assumeError, setAssumeError] = useState<string | null>(null);
  const [assumeLoadingUid, setAssumeLoadingUid] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageUser, setManageUser] = useState<AdminUser | null>(null);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    displayName: "",
    isAdmin: false,
    businessId: "",
    role: "staff" as "owner" | "staff",
    sendLink: true,
  });
  const [manageForm, setManageForm] = useState({
    displayName: "",
    isAdmin: false,
    businessId: "",
    role: "staff" as "owner" | "staff",
  });

  const loadUsers = useCallback(
    async (currentUser: NonNullable<typeof user>) => {
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
        setUsers(json.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadBusinesses = useCallback(
    async (currentUser: NonNullable<typeof user>) => {
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch("/api/admin/entities", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const json = (await res.json()) as { businesses?: BusinessOption[]; error?: string };
        if (res.ok && json.businesses) {
          setBusinesses(json.businesses);
        }
      } catch {
        // Silent fail for now.
      }
    },
    [],
  );

  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const currentUser = user;
    async function load() {
      if (canceled) return;
      await Promise.all([loadUsers(currentUser), loadBusinesses(currentUser)]);
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [loadBusinesses, loadUsers, user]);

  const counts = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter((u) => u.isAdmin).length,
      staff: users.filter((u) => u.businessAdmin).length,
    };
  }, [users]);

  const businessMap = useMemo(() => {
    return new Map(businesses.map((biz) => [biz.id, biz]));
  }, [businesses]);

  const inviteMailto = useMemo(() => {
    if (!inviteStatus?.actionLink || !inviteForm.email.trim()) return null;
    const subject = encodeURIComponent("You're invited to Rack Up");
    const body = encodeURIComponent(
      `You have been invited to Rack Up.\n\nCreate or reset your password using this link:\n${inviteStatus.actionLink}\n\nIf you already have an account, this link will let you reset your password.`,
    );
    return `mailto:${inviteForm.email.trim()}?subject=${subject}&body=${body}`;
  }, [inviteForm.email, inviteStatus?.actionLink]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteStatus(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: inviteForm.email,
          displayName: inviteForm.displayName || undefined,
          isAdmin: inviteForm.isAdmin,
          businessId: inviteForm.businessId || undefined,
          role: inviteForm.role,
          sendLink: inviteForm.sendLink,
        }),
      });
      const json = (await res.json()) as InviteResult & { error?: string };
      if (!res.ok || !json.user) {
        throw new Error(json.error ?? "Failed to send invite.");
      }
      setInviteStatus(json);
      await loadUsers(user);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleAssume(targetUid: string) {
    if (!user) return;
    setAssumeError(null);
    setAssumeLoadingUid(targetUid);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/users/assume", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: targetUid }),
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) {
        throw new Error(json.error ?? "Failed to assume user.");
      }
      const url = `/assume?token=${encodeURIComponent(json.token)}&redirect=${encodeURIComponent(
        "/profile",
      )}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setAssumeError(err instanceof Error ? err.message : "Failed to assume user.");
    } finally {
      setAssumeLoadingUid(null);
    }
  }

  function openManage(userRow: AdminUser) {
    setManageUser(userRow);
    setManageForm({
      displayName: userRow.displayName ?? "",
      isAdmin: userRow.isAdmin,
      businessId: userRow.businessAdmin?.businessId ?? "",
      role: (userRow.businessAdmin?.role as "owner" | "staff") ?? "staff",
    });
    setManageError(null);
    setManageOpen(true);
  }

  async function handleManageSave() {
    if (!user || !manageUser) return;
    setManageSaving(true);
    setManageError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/users/update", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: manageUser.uid,
          displayName: manageForm.displayName,
          isAdmin: manageForm.isAdmin,
          businessId: manageForm.businessId ? manageForm.businessId : null,
          role: manageForm.role,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to update user.");
      }
      await loadUsers(user);
      setManageOpen(false);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setManageSaving(false);
    }
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Users</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Invite users, manage affiliations, and assume access to troubleshoot.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {assumeError ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {assumeError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total users</div>
          <div className="mt-1 text-2xl font-bold text-white">{counts.total}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admins</div>
          <div className="mt-1 text-2xl font-bold text-white">{counts.admins}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Business staff</div>
          <div className="mt-1 text-2xl font-bold text-white">{counts.staff}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-white">Invite user</div>
          <div className="text-xs text-zinc-400">
            Create a new user, assign roles, and send them an invite to complete signup.
          </div>
        </div>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleInvite}>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Email
            </label>
            <Input
              type="email"
              required
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="person@company.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Display name
            </label>
            <Input
              type="text"
              value={inviteForm.displayName}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, displayName: event.target.value }))
              }
              placeholder="Optional name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Business affiliation
            </label>
            <Select
              value={inviteForm.businessId}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, businessId: event.target.value }))
              }
            >
              <option value="">No business</option>
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Business role
            </label>
            <Select
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  role: event.target.value === "owner" ? "owner" : "staff",
                }))
              }
              disabled={!inviteForm.businessId}
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <SwitchField>
              <span data-slot="label" className="text-sm text-white">
                Grant admin access
              </span>
              <Switch
                checked={inviteForm.isAdmin}
                onChange={(value) =>
                  setInviteForm((prev) => ({ ...prev, isAdmin: Boolean(value) }))
                }
                color="emerald"
              />
            </SwitchField>
          </div>
          <div className="md:col-span-2">
            <SwitchField>
              <span data-slot="label" className="text-sm text-white">
                Generate invite link
              </span>
              <Switch
                checked={inviteForm.sendLink}
                onChange={(value) =>
                  setInviteForm((prev) => ({ ...prev, sendLink: Boolean(value) }))
                }
                color="blue"
              />
            </SwitchField>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-3">
            <Button type="submit" color="emerald" disabled={inviteLoading}>
              {inviteLoading ? "Sending…" : "Send invite"}
            </Button>
            <Button
              type="button"
              outline
              onClick={() => {
                setInviteForm({
                  email: "",
                  displayName: "",
                  isAdmin: false,
                  businessId: "",
                  role: "staff",
                  sendLink: true,
                });
                setInviteStatus(null);
                setInviteError(null);
              }}
            >
              Reset
            </Button>
          </div>
        </form>

        {inviteError ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {inviteError}
          </div>
        ) : null}

        {inviteStatus ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm font-semibold text-white">Invite created.</div>
            <div className="text-xs text-zinc-400">
              {inviteStatus.user.email ?? "User"} ·{" "}
              {inviteStatus.user.isAdmin ? "Admin" : "Standard"}{" "}
              {inviteStatus.user.businessAdmin
                ? `· ${businessMap.get(inviteStatus.user.businessAdmin.businessId ?? "")?.name ?? inviteStatus.user.businessAdmin.businessId ?? "Business"} (${inviteStatus.user.businessAdmin.role ?? "staff"})`
                : "· No business"}
            </div>
            {inviteStatus.actionLink ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Invite link
                </label>
                <Input value={inviteStatus.actionLink} readOnly />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    outline
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteStatus.actionLink ?? "");
                    }}
                  >
                    Copy link
                  </Button>
                  {inviteMailto ? (
                    <Button href={inviteMailto} color="emerald">
                      Email invite
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
          <div className="font-semibold text-white">Users</div>
          <div className="text-xs text-zinc-500">
            {loading ? "Loading…" : `${users.length} loaded`}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-white/5 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-3 text-zinc-400" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              ) : null}
              {users.map((u) => (
                <tr key={u.uid} className="border-t border-white/5 text-sm hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <div className="font-medium text-white">{u.email ?? "—"}</div>
                    <div className="text-xs text-zinc-400">{u.uid}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{u.displayName ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-200">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {u.isAdmin ? (
                        <span className="rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-xs font-medium text-white">
                          Admin
                        </span>
                      ) : null}
                      {u.businessAdmin ? (
                        <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                          {u.businessAdmin.role ?? "staff"} ·{" "}
                          {businessMap.get(u.businessAdmin.businessId ?? "")?.name ??
                            u.businessAdmin.businessId ??
                            "—"}
                        </span>
                      ) : null}
                      {!u.isAdmin && !u.businessAdmin ? (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          User
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button outline onClick={() => openManage(u)}>
                        Manage
                      </Button>
                      <Button
                        color="emerald"
                        disabled={assumeLoadingUid === u.uid}
                        onClick={() => handleAssume(u.uid)}
                      >
                        {assumeLoadingUid === u.uid ? "Opening…" : "Assume"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} size="md">
        <DialogTitle>Manage user</DialogTitle>
        <DialogBody className="space-y-4">
          <div className="text-xs text-zinc-500">
            {manageUser?.email ?? manageUser?.uid ?? ""}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Display name
            </label>
            <Input
              value={manageForm.displayName}
              onChange={(event) =>
                setManageForm((prev) => ({ ...prev, displayName: event.target.value }))
              }
              placeholder="Optional name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Business affiliation
            </label>
            <Select
              value={manageForm.businessId}
              onChange={(event) =>
                setManageForm((prev) => ({ ...prev, businessId: event.target.value }))
              }
            >
              <option value="">No business</option>
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Business role
            </label>
            <Select
              value={manageForm.role}
              onChange={(event) =>
                setManageForm((prev) => ({
                  ...prev,
                  role: event.target.value === "owner" ? "owner" : "staff",
                }))
              }
              disabled={!manageForm.businessId}
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </Select>
          </div>
          <SwitchField>
            <span data-slot="label" className="text-sm text-white">
              Admin access
            </span>
            <Switch
              checked={manageForm.isAdmin}
              onChange={(value) =>
                setManageForm((prev) => ({ ...prev, isAdmin: Boolean(value) }))
              }
              color="emerald"
            />
          </SwitchField>
          {manageError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {manageError}
            </div>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button outline onClick={() => setManageOpen(false)}>
            Cancel
          </Button>
          <Button color="emerald" onClick={handleManageSave} disabled={manageSaving}>
            {manageSaving ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
