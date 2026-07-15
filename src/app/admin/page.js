"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Plus,
  Trophy,
  Calendar,
  Users,
  ChevronRight,
  Loader2,
  Award,
  ShieldAlert,
  ImagePlus,
  X,
  Pencil,
  Check,
  Tags,
  Radio,
  Lock,
  LogOut,
  Trash2,
} from "lucide-react";

const SUGGESTED_CATEGORIES = ["U12", "U13", "U14", "U15", "U16", "U18", "OPEN"];

function toDateInputValue(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function teamCount(tournament) {
  if (!tournament?.categories) return 0;
  return tournament.categories.reduce(
    (sum, c) => sum + (c._count?.teams ?? c.teams?.length ?? 0),
    0
  );
}

function DynamicCategoryEditor({ selected, onChange, idPrefix = "cat" }) {
  const [draft, setDraft] = useState("");

  const normalize = (name) => name.trim().replace(/\s+/g, " ");

  const addCategory = (raw) => {
    const name = normalize(raw);
    if (!name) return;
    const exists = selected.some((c) => c.toLowerCase() === name.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...selected, name]);
    setDraft("");
  };

  const removeCategory = (name) => {
    onChange(selected.filter((c) => c !== name));
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-mustard-gold text-deep-forest border border-mustard-gold shadow-sm"
            >
              <Tags className="w-2.5 h-2.5" />
              {cat}
              <button
                type="button"
                onClick={() => removeCategory(cat)}
                className="p-1.5 -mr-1 rounded hover:bg-deep-forest/10 cursor-pointer min-h-[28px] min-w-[28px] flex items-center justify-center"
                aria-label={`Remove ${cat}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={`${idPrefix}-input`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCategory(draft);
            }
          }}
          placeholder="e.g. U15, OPEN, Girls U13..."
          className="flex-1 bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-sm text-deep-forest outline-none"
        />
        <button
          type="button"
          onClick={() => addCategory(draft)}
          disabled={!draft.trim()}
          className="px-3 py-2 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] font-mono text-deep-forest/40 uppercase tracking-wider self-center mr-1">
          Quick:
        </span>
        {SUGGESTED_CATEGORIES.filter(
          (s) => !selected.some((c) => c.toLowerCase() === s.toLowerCase())
        ).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => addCategory(cat)}
            className="px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider border border-dashed border-slate-300 text-deep-forest/60 hover:border-mustard-gold hover:text-deep-forest cursor-pointer"
          >
            + {cat}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AdminHome() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [categories, setCategories] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [sport, setSport] = useState("FOOTBALL");
  const [oversPerInnings, setOversPerInnings] = useState(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const logoInputRef = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCategories, setEditCategories] = useState([]);
  const [editStartDate, setEditStartDate] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const editLogoInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        setAuthenticated(!!data.authenticated);
      } catch {
        setAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (authenticated) fetchTournaments();
  }, [authenticated]);

  // Silently renew session while admin stays on the page
  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(async () => {
      try {
        await fetch("/api/admin/me", {
          cache: "no-store",
          credentials: "include",
        });
      } catch {
        /* ignore */
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoggingIn(true);
      setLoginError(null);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid password");
      }
      setAuthenticated(true);
      setPassword("");
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/")) {
        window.location.href = next;
      }
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
    setAuthenticated(false);
    setTournaments([]);
  };

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tournaments");
      if (!res.ok) throw new Error("Failed to load tournaments");
      const data = await res.json();
      setTournaments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setLogoUrl(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (categories.length === 0) {
      alert("Select at least one category");
      return;
    }
    if (sport === "CRICKET") {
      const overs = parseInt(oversPerInnings, 10);
      if (!overs || overs < 1 || overs > 50) {
        alert("Enter overs per innings between 1 and 50");
        return;
      }
    }

    try {
      setCreating(true);
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate,
          logoUrl,
          categories,
          sport,
          oversPerInnings: sport === "CRICKET" ? oversPerInnings : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create tournament");
      }

      const newTournament = await res.json();
      setName("");
      setCategories([]);
      setStartDate("");
      setSport("FOOTBALL");
      setOversPerInnings(20);
      clearLogo();
      setTournaments([newTournament, ...tournaments]);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (tournament) => {
    setEditingId(tournament.id);
    setEditName(tournament.name || "");
    setEditCategories((tournament.categories || []).map((c) => c.name));
    setEditStartDate(toDateInputValue(tournament.startDate));
    setEditLogoUrl(tournament.logoUrl || null);
    if (editLogoInputRef.current) editLogoInputRef.current.value = "";
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName("");
    setEditCategories([]);
    setEditStartDate("");
    setEditLogoUrl(null);
    if (editLogoInputRef.current) editLogoInputRef.current.value = "";
  };

  const handleDeleteTournament = async () => {
    if (!pendingDelete) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/tournaments/${pendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete tournament");
      }
      setTournaments((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      if (editingId === pendingDelete.id) cancelEditing();
      setPendingDelete(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEditLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setEditLogoUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    if (editCategories.length === 0) {
      alert("Keep at least one category");
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch(`/api/tournaments/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          startDate: editStartDate,
          logoUrl: editLogoUrl,
          categories: editCategories,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update tournament");
      }

      const updated = await res.json();
      setTournaments((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, ...updated } : t))
      );
      cancelEditing();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-cream-bg gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-mustard-gold" />
        <p className="text-xs font-mono text-deep-forest/50 uppercase tracking-widest">
          Checking access...
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans">
        <header className="pitch-stripes border-b-4 border-mustard-gold/80 relative overflow-hidden py-10">
          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          <div className="max-w-md mx-auto px-4 relative z-10 text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-mustard-gold font-mono text-[10px] font-bold uppercase tracking-widest">
              <Lock className="w-3.5 h-3.5" />
              Restricted
            </div>
            <h1 className="text-3xl font-display uppercase text-white drop-shadow">
              FORCEPLUS Admin
            </h1>
          </div>
        </header>

        <main className="flex-1 flex items-start justify-center px-4 py-16">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-sm space-y-5"
          >
            <div>
              <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                Admin Password
              </label>
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-4 py-2.5 text-sm outline-none"
                placeholder="••••••••"
              />
            </div>

            {loginError && (
              <div className="text-[10px] font-mono text-red-600 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Unlock Admin
            </button>

            <p className="text-[9px] font-mono text-center text-deep-forest/40">
              Spectators use the public home — this page is for organizers only.
            </p>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans selection:bg-mustard-gold selection:text-deep-forest overflow-x-hidden relative">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-md relative overflow-hidden py-10">
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-mustard-gold font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest">
              <span>FORCEPLUS</span>
              <span className="text-white/60">•</span>
              <span>Tournament Manager</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer min-h-[44px]"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display uppercase tracking-normal text-white drop-shadow">
            Set up your tournament
          </h1>
          <p className="text-sm text-white/80 font-medium max-w-xl">
            Create a tournament with one or more categories — each gets its own schedule.
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
            <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-2 mb-6 border-b border-cream-bg pb-3">
                <Award className="w-5 h-5 text-mustard-gold" />
                <h2 className="text-sm font-bold text-deep-forest tracking-wider uppercase font-mono">
                  Create Tournament
                </h2>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Tournament Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FORCEPLUS Championship 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Sport
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "FOOTBALL", label: "Football" },
                      { id: "CRICKET", label: "Cricket" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSport(opt.id)}
                        className={`py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border cursor-pointer transition-all ${
                          sport === opt.id
                            ? "bg-mustard-gold border-mustard-gold text-deep-forest"
                            : "bg-cream-bg/40 border-slate-200 text-deep-forest/60 hover:border-mustard-gold/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {sport === "CRICKET" && (
                  <div>
                    <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                      Overs per innings
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      required
                      value={oversPerInnings}
                      onChange={(e) => setOversPerInnings(e.target.value)}
                      className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest outline-none transition-all"
                    />
                    <p className="mt-2 text-[9px] font-mono text-deep-forest/45">
                      Each side bats for this many overs (e.g. 6, 10, or 20).
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Categories
                  </label>
                  <DynamicCategoryEditor selected={categories} onChange={setCategories} />
                  <p className="mt-2 text-[9px] font-mono text-deep-forest/45">
                    Type any category name and click Add — each gets its own clubs and schedule.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Tournament Logo
                  </label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    id="tournament-logo"
                  />
                  {logoUrl ? (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={logoUrl}
                          alt="Tournament logo preview"
                          className="w-14 h-14 rounded-xl object-cover border-2 border-mustard-gold shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={clearLogo}
                          className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors cursor-pointer"
                          aria-label="Remove logo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="text-[10px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover hover:underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="tournament-logo"
                      className="flex items-center gap-2.5 w-full bg-cream-bg/40 border border-dashed border-slate-300 hover:border-mustard-gold rounded-xl px-4 py-3 text-sm text-deep-forest/50 cursor-pointer transition-all"
                    >
                      <ImagePlus className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-mono">Upload logo image</span>
                    </label>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Kickoff Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 duration-200"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-deep-forest" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3px]" />
                      Launch Tournament
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
                ACTIVE TOURNAMENTS
              </h2>
              <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded-full px-3.5 py-1 font-bold shadow-sm">
                Count: {tournaments.length}
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white border-2 border-dashed border-mustard-gold rounded-2xl gap-4 shadow-sm">
                <Loader2 className="w-8 h-8 animate-spin text-mustard-gold" />
                <p className="text-xs font-mono text-deep-forest/50">Querying database...</p>
              </div>
            ) : error ? (
              <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-mono flex items-center justify-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Error: {error}
              </div>
            ) : tournaments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 bg-white border-2 border-dashed border-mustard-gold rounded-2xl gap-4 text-center px-6 relative overflow-hidden shadow-sm animate-fadeIn">
                <Trophy className="w-12 h-12 text-slate-300" />
                <h3 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">
                  No Tournaments Registered
                </h3>
                <p className="text-xs text-deep-forest/60 max-w-sm leading-relaxed">
                  Launch a tournament and pick categories like U15 and OPEN — each category will have its own clubs and fixtures.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tournaments.map((t) => {
                  const isEditing = editingId === t.id;

                  if (isEditing) {
                    return (
                      <form
                        key={t.id}
                        onSubmit={handleSaveEdit}
                        className="flex flex-col bg-white border-2 border-solid border-mustard-gold rounded-2xl p-6 shadow-md relative overflow-hidden"
                      >
                        <div className="flex items-center gap-2 mb-4 border-b border-cream-bg pb-3">
                          <Pencil className="w-4 h-4 text-mustard-gold" />
                          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-deep-forest/70">
                            Edit Tournament
                          </h3>
                        </div>

                        <div className="space-y-4 flex-1">
                          <div>
                            <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                              Name
                            </label>
                            <input
                              type="text"
                              required
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-sm text-deep-forest outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                              Categories
                            </label>
                            <DynamicCategoryEditor
                              selected={editCategories}
                              onChange={setEditCategories}
                              idPrefix={`edit-${t.id}`}
                            />
                            <p className="mt-1.5 text-[9px] font-mono text-red-600/70">
                              Removing a category deletes its clubs and schedule.
                            </p>
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                              Logo
                            </label>
                            <input
                              ref={editLogoInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleEditLogoChange}
                              className="hidden"
                              id={`edit-logo-${t.id}`}
                            />
                            {editLogoUrl ? (
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <img
                                    src={editLogoUrl}
                                    alt="Logo preview"
                                    className="w-12 h-12 rounded-xl object-cover border-2 border-mustard-gold shadow-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditLogoUrl(null);
                                      if (editLogoInputRef.current)
                                        editLogoInputRef.current.value = "";
                                    }}
                                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600 cursor-pointer"
                                    aria-label="Remove logo"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => editLogoInputRef.current?.click()}
                                  className="text-[10px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover hover:underline cursor-pointer"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <label
                                htmlFor={`edit-logo-${t.id}`}
                                className="flex items-center gap-2 w-full bg-cream-bg/40 border border-dashed border-slate-300 hover:border-mustard-gold rounded-xl px-3 py-2.5 text-deep-forest/50 cursor-pointer"
                              >
                                <ImagePlus className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-mono">Upload logo</span>
                              </label>
                            )}
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-1.5 font-bold">
                              Kickoff Date
                            </label>
                            <input
                              type="date"
                              value={editStartDate}
                              onChange={(e) => setEditStartDate(e.target.value)}
                              className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-sm text-deep-forest outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                          <button
                            type="submit"
                            disabled={savingEdit}
                            className="flex-1 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-2.5 rounded-xl text-[10px] font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {savingEdit ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={savingEdit}
                            className="px-4 py-2.5 bg-cream-bg border border-slate-200 text-deep-forest/70 rounded-xl text-[10px] font-mono uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={t.id}
                      className="group flex flex-col bg-white border-2 border-dashed border-mustard-gold hover:border-solid hover:border-mustard-gold hover:shadow-md rounded-2xl p-6 transition-all duration-350 shadow-sm relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-mustard-gold transform -translate-y-full group-hover:translate-y-0 transition-transform duration-300" />

                      <div className="flex justify-between items-start gap-3 mb-6">
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex items-center gap-3 min-w-0 flex-1"
                        >
                          {t.logoUrl ? (
                            <img
                              src={t.logoUrl}
                              alt={`${t.name} logo`}
                              className="w-12 h-12 rounded-xl object-cover border-2 border-mustard-gold/60 shadow-sm shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-cream-bg border border-slate-200 flex items-center justify-center shrink-0">
                              <Trophy className="w-5 h-5 text-mustard-gold" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-deep-forest group-hover:text-mustard-gold-hover transition-colors leading-snug font-display tracking-wide uppercase truncate">
                              {t.name}
                            </h3>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <span className="inline-flex items-center text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest bg-[#0d472c]/10 border border-[#0d472c]/20 rounded-md px-1.5 py-0.5">
                                {t.sport === "CRICKET"
                                  ? `Cricket · ${t.oversPerInnings || "?"} ov`
                                  : "Football"}
                              </span>
                              {(t.categories || []).map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover bg-mustard-gold/15 border border-mustard-gold/40 rounded-md px-1.5 py-0.5"
                                >
                                  <Tags className="w-2.5 h-2.5" />
                                  {c.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Link>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Link
                            href={`/live/${t.id}`}
                            className="p-2.5 bg-cream-bg rounded-lg border border-slate-200 text-deep-forest hover:bg-mustard-gold hover:border-mustard-gold transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Live board for ${t.name}`}
                            title="Public live board"
                          >
                            <Radio className="w-4 h-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => startEditing(t)}
                            className="p-2.5 bg-cream-bg rounded-lg border border-slate-200 text-deep-forest hover:bg-mustard-gold hover:border-mustard-gold transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Edit ${t.name}`}
                            title="Edit tournament"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(t)}
                            className="p-2.5 bg-cream-bg rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Delete ${t.name}`}
                            title="Delete tournament"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/tournaments/${t.id}`}
                            className="p-2.5 bg-cream-bg rounded-lg border border-slate-200 text-deep-forest hover:bg-mustard-gold hover:border-mustard-gold transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Open ${t.name}`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between text-[10px] font-mono text-deep-forest/60 border-t border-slate-100 pt-4 gap-4">
                        <div className="flex items-center gap-1.5 bg-cream-bg border border-slate-200/60 rounded-md px-2 py-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {new Date(t.startDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-cream-bg border border-slate-200/60 rounded-md px-2 py-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-deep-forest font-bold">
                            {teamCount(t)} Club(s)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tournament-title"
        >
          <div className="w-full max-w-md bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3
                  id="delete-tournament-title"
                  className="text-sm font-mono font-bold uppercase tracking-wider text-deep-forest"
                >
                  Confirm delete
                </h3>
                <p className="mt-2 text-sm text-deep-forest/80 font-sans">
                  Delete{" "}
                  <span className="font-bold uppercase">{pendingDelete.name}</span>?
                </p>
                <p className="mt-1.5 text-[11px] font-mono text-deep-forest/50 leading-relaxed">
                  This removes all clubs, matches, and scores. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-cream-bg text-[10px] font-mono font-bold uppercase tracking-wider text-deep-forest cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteTournament}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete tournament
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-[10px] font-mono text-slate-400 tracking-wider">
        <p>© 2026 MATCH DAY SCORER • POWERED BY GEMINI DEVELOPER AGENT</p>
      </footer>
    </div>
  );
}
