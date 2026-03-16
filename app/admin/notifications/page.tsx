"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Dialog, DialogActions, DialogBody, DialogTitle } from "@/ui-kit/dialog";

type NotificationRow = {
  id: string;
  title: string;
  description: string;
  color: "amber" | "emerald" | "blue" | "red" | "zinc";
  active: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<NotificationRow["color"]>("amber");
  const [active, setActive] = useState(true);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/notifications", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = (await res.json()) as { notifications?: NotificationRow[]; error?: string };
      if (!res.ok || !json.notifications) throw new Error(json.error ?? "Failed to load notifications.");
      setRows(json.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setColor("amber");
    setActive(true);
  }

  function openCreateModal() {
    resetForm();
    setModalOpen(true);
  }

  function openEditModal(row: NotificationRow) {
    setEditingId(row.id);
    setTitle(row.title);
    setDescription(row.description);
    setColor(row.color ?? "amber");
    setActive(row.active);
    setModalOpen(true);
  }

  async function saveNotification() {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const idToken = await user.getIdToken();
      const isEdit = Boolean(editingId);
      const res = await fetch(
        isEdit ? `/api/admin/notifications/${editingId}` : "/api/admin/notifications",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, description, color, active }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to ${isEdit ? "update" : "create"} notification.`);
      setMessage(isEdit ? "Notification updated." : "Notification created.");
      setModalOpen(false);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notification.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotification(notificationId: string, nextActive: boolean) {
    if (!user) return;
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/notifications/${notificationId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active: nextActive }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update notification.");
      setRows((prev) => prev.map((row) => (row.id === notificationId ? { ...row, active: nextActive } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update notification.");
    }
  }

  function colorTone(color: NotificationRow["color"]) {
    if (color === "emerald") {
      return {
        wrap: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
        text: "text-emerald-50",
      };
    }
    if (color === "blue") {
      return {
        wrap: "border-blue-400/30 bg-blue-500/10 text-blue-100",
        text: "text-blue-50",
      };
    }
    if (color === "red") {
      return {
        wrap: "border-red-400/30 bg-red-500/10 text-red-100",
        text: "text-red-50",
      };
    }
    if (color === "zinc") {
      return {
        wrap: "border-white/20 bg-white/10 text-zinc-100",
        text: "text-zinc-50",
      };
    }
    return {
      wrap: "border-amber-400/30 bg-amber-500/10 text-amber-100",
      text: "text-amber-50",
    };
  }

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Notifications</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure profile banner alerts shown to public users.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black"
        >
          New notification
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Active preview</h2>
        {rows.filter((row) => row.active).length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
            No active notifications to preview.
          </div>
        ) : (
          rows
            .filter((row) => row.active)
            .map((row) => {
              const tone = colorTone(row.color);
              return (
                <div key={`preview-${row.id}`} className={`w-full rounded-2xl border p-4 ${tone.wrap}`}>
                  <div className="text-sm font-semibold">{row.title}</div>
                  <div className={`mt-1 text-sm ${tone.text}`}>{row.description}</div>
                </div>
              );
            })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Existing notifications</h2>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">No notifications configured.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{row.title}</h3>
                    <p className="mt-1 text-sm text-zinc-300">{row.description}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {row.active ? "Visible" : "Hidden"} · Updated{" "}
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleNotification(row.id, !row.active)}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-zinc-200"
                  >
                    {row.active ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(row)}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-zinc-200"
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <DialogTitle>{editingId ? "Edit notification" : "Create notification"}</DialogTitle>
        <DialogBody className="space-y-4">
          <label className="block text-sm text-zinc-300">
            <div className="mb-1">Title</div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            <div className="mb-1">Description</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            <div className="mb-1">Color</div>
            <select
              value={color}
              onChange={(event) => setColor(event.target.value as NotificationRow["color"])}
              className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-emerald-400"
            >
              <option value="amber">Amber</option>
              <option value="emerald">Emerald</option>
              <option value="blue">Blue</option>
              <option value="red">Red</option>
              <option value="zinc">Neutral</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Active (shown on profile)
          </label>
        </DialogBody>
        <DialogActions>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveNotification()}
            disabled={saving}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Create notification"}
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
