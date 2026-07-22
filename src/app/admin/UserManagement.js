"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  UserCog,
  Pencil,
  Check,
  X,
} from "lucide-react";

export default function UserManagement({ tournaments }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "MANAGER",
    tournamentIds: [],
  });

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      role: "MANAGER",
      tournamentIds: [],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load users");
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const startEdit = (user) => {
    setEditingId(user.id);
    setShowForm(true);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      tournamentIds: (user.assignments || []).map((a) => a.tournamentId),
    });
  };

  const toggleTournament = (tournamentId) => {
    setForm((prev) => {
      const has = prev.tournamentIds.includes(tournamentId);
      return {
        ...prev,
        tournamentIds: has
          ? prev.tournamentIds.filter((id) => id !== tournamentId)
          : [...prev.tournamentIds, tournamentId],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    if (!editingId && !form.password) {
      alert("Password is required for new users");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        tournamentIds: form.role === "MANAGER" ? form.tournamentIds : [],
      };
      if (form.password) payload.password = form.password;

      const res = await fetch(
        editingId ? `/api/admin/users/${editingId}` : "/api/admin/users",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save user");
      resetForm();
      await loadUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete user ${user.name}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-mustard-gold" />
          <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
            Tournament managers
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add user
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 border-t-4 border-t-mustard-gold rounded-2xl p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-cream-bg pb-3">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-deep-forest/70">
              {editingId ? "Edit user" : "New tournament manager"}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-deep-forest/50 hover:text-deep-forest cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                Email
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                {editingId ? "New password (optional)" : "Password"}
              </label>
              <input
                type="password"
                required={!editingId}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-sm outline-none"
                placeholder={editingId ? "Leave blank to keep" : "Min 6 characters"}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                Role
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-sm outline-none"
              >
                <option value="MANAGER">Tournament manager</option>
                <option value="ADMIN">Full admin</option>
              </select>
            </div>
          </div>

          {form.role === "MANAGER" && (
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                Assigned tournaments
              </label>
              {tournaments.length === 0 ? (
                <p className="text-xs text-deep-forest/50 font-mono">
                  Create a tournament first, then assign it here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-cream-bg/30">
                  {tournaments.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.tournamentIds.includes(t.id)}
                        onChange={() => toggleTournament(t.id)}
                        className="accent-mustard-gold"
                      />
                      <span className="truncate">{t.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {editingId ? "Save changes" : "Create user"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-[10px] font-mono uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-mustard-gold" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          {error}
        </div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-deep-forest/50 font-mono bg-white border border-slate-200 rounded-2xl">
          No users yet. Add a tournament manager to assign scoring and scheduling access.
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-deep-forest">{user.name}</h3>
                  <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-deep-forest/70">
                    {user.role === "ADMIN" ? "Admin" : "Manager"}
                  </span>
                  {!user.active && (
                    <span className="text-[9px] font-mono uppercase text-red-600">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-deep-forest/60 mt-0.5">{user.email}</p>
                {user.role === "MANAGER" && (
                  <p className="text-[10px] font-mono text-deep-forest/50 mt-2">
                    {(user.assignments || []).length === 0
                      ? "No tournaments assigned"
                      : `Assigned: ${(user.assignments || [])
                          .map((a) => a.tournament?.name || "Tournament")
                          .join(", ")}`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(user)}
                  className="p-2 rounded-lg border border-slate-200 hover:border-mustard-gold cursor-pointer"
                  aria-label={`Edit ${user.name}`}
                >
                  <Pencil className="w-4 h-4 text-deep-forest/70" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(user)}
                  className="p-2 rounded-lg border border-slate-200 hover:border-red-300 cursor-pointer"
                  aria-label={`Delete ${user.name}`}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
