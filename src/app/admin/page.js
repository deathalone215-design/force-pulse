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
import { uploadImageToSupabase } from "@/lib/imageUpload";
import { categoryDisplayName, sportLabel } from "@/lib/sports";

const SUGGESTED_CATEGORIES = ["U12", "U13", "U14", "U15", "U16", "U18", "OPEN"];
const SPORT_OPTIONS = [
  { id: "FOOTBALL", label: "Football" },
  { id: "CRICKET", label: "Cricket" },
  { id: "VOLLEYBALL", label: "Volleyball" },
  { id: "BADMINTON", label: "Badminton" },
  { id: "PICKLEBALL", label: "Pickleball" },
];

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

function categoryKey(c) {
  return `${(c.sport || "FOOTBALL").toUpperCase()}::${(c.name || "").toLowerCase()}`;
}

/** Rows: { name, sport, oversPerInnings, fullTimeMinutes, extraTimeMinutes } */
function SportCategoryEditor({ selected, onChange, idPrefix = "cat" }) {
  const [draftName, setDraftName] = useState("");
  const [draftSport, setDraftSport] = useState("FOOTBALL");
  const [draftOvers, setDraftOvers] = useState("20");
  const [draftFullTime, setDraftFullTime] = useState("20");
  const [draftExtra, setDraftExtra] = useState("0");

  const normalize = (name) => name.trim().replace(/\s+/g, " ");

  const addCategory = (
    rawName,
    sport = draftSport,
    overs = draftOvers,
    fullTime = draftFullTime,
    extra = draftExtra
  ) => {
    const name = normalize(rawName);
    if (!name) return;
    const sportId = String(sport || "FOOTBALL").toUpperCase();
    const row = {
      name,
      sport: sportId,
      oversPerInnings:
        sportId === "CRICKET" ? parseInt(overs, 10) || 20 : null,
      fullTimeMinutes:
        sportId === "FOOTBALL" ? parseInt(fullTime, 10) || 20 : null,
      extraTimeMinutes:
        sportId === "FOOTBALL" ? Math.max(0, parseInt(extra, 10) || 0) : null,
    };
    if (selected.some((c) => categoryKey(c) === categoryKey(row))) {
      setDraftName("");
      return;
    }
    if (sportId === "CRICKET") {
      const ov = parseInt(overs, 10);
      if (!ov || ov < 1 || ov > 50) {
        alert("Cricket categories need overs between 1 and 50");
        return;
      }
      row.oversPerInnings = ov;
      row.fullTimeMinutes = null;
      row.extraTimeMinutes = null;
    }
    if (sportId === "FOOTBALL") {
      const ft = parseInt(fullTime, 10);
      if (!ft || ft < 1 || ft > 120) {
        alert("Football categories need full time between 1 and 120 minutes");
        return;
      }
      const ex = Math.max(0, Math.min(30, parseInt(extra, 10) || 0));
      row.fullTimeMinutes = ft;
      row.extraTimeMinutes = ex > 0 ? ex : null;
      row.oversPerInnings = null;
    }
    if (sportId !== "FOOTBALL" && sportId !== "CRICKET") {
      row.oversPerInnings = null;
      row.fullTimeMinutes = null;
      row.extraTimeMinutes = null;
    }
    onChange([...selected, row]);
    setDraftName("");
  };

  const removeCategory = (row) => {
    onChange(selected.filter((c) => categoryKey(c) !== categoryKey(row)));
  };

  const updateRow = (row, patch) => {
    onChange(
      selected.map((c) =>
        categoryKey(c) === categoryKey(row) ? { ...c, ...patch } : c
      )
    );
  };

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="space-y-2">
          {selected.map((cat) => (
            <div
              key={categoryKey(cat)}
              className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-cream-bg/60 border border-slate-200"
            >
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider bg-mustard-gold text-deep-forest">
                <Tags className="w-2.5 h-2.5" />
                {cat.name}
              </span>
              <select
                value={cat.sport || "FOOTBALL"}
                onChange={(e) => {
                  const sport = e.target.value;
                  updateRow(cat, {
                    sport,
                    oversPerInnings:
                      sport === "CRICKET" ? cat.oversPerInnings || 20 : null,
                    fullTimeMinutes:
                      sport === "FOOTBALL" ? cat.fullTimeMinutes || 20 : null,
                    extraTimeMinutes:
                      sport === "FOOTBALL" ? cat.extraTimeMinutes || null : null,
                  });
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-mono font-bold uppercase outline-none"
              >
                {SPORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {cat.sport === "CRICKET" && (
                <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                  Overs
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cat.oversPerInnings || 20}
                    onChange={(e) =>
                      updateRow(cat, {
                        oversPerInnings: parseInt(e.target.value, 10) || 20,
                      })
                    }
                    className="w-14 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                  />
                </label>
              )}
              {(cat.sport || "FOOTBALL") === "FOOTBALL" && (
                <>
                  <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                    FT min
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={cat.fullTimeMinutes || 20}
                      onChange={(e) =>
                        updateRow(cat, {
                          fullTimeMinutes: parseInt(e.target.value, 10) || 20,
                        })
                      }
                      className="w-14 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                    +Extra
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={cat.extraTimeMinutes || 0}
                      onChange={(e) => {
                        const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                        updateRow(cat, {
                          extraTimeMinutes: n > 0 ? n : null,
                        });
                      }}
                      className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                onClick={() => removeCategory(cat)}
                className="ml-auto p-1.5 rounded hover:bg-red-50 text-red-600 cursor-pointer"
                aria-label={`Remove ${cat.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 p-3 rounded-xl border border-dashed border-slate-300 bg-white/50">
        <div className="flex flex-wrap gap-2">
          <input
            id={`${idPrefix}-input`}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory(draftName);
              }
            }}
            placeholder="Category e.g. OPEN, U15"
            className="flex-1 min-w-[120px] bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-sm text-deep-forest outline-none"
          />
          <select
            value={draftSport}
            onChange={(e) => setDraftSport(e.target.value)}
            className="bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2 text-[10px] font-mono font-bold uppercase outline-none"
          >
            {SPORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {draftSport === "CRICKET" && (
            <input
              type="number"
              min={1}
              max={50}
              value={draftOvers}
              onChange={(e) => setDraftOvers(e.target.value)}
              title="Overs per innings"
              className="w-16 bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none"
            />
          )}
          {draftSport === "FOOTBALL" && (
            <>
              <input
                type="number"
                min={1}
                max={120}
                value={draftFullTime}
                onChange={(e) => setDraftFullTime(e.target.value)}
                title="Full time (minutes)"
                placeholder="FT"
                className="w-16 bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none"
              />
              <input
                type="number"
                min={0}
                max={30}
                value={draftExtra}
                onChange={(e) => setDraftExtra(e.target.value)}
                title="Extra minutes (+N')"
                placeholder="+Extra"
                className="w-16 bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none"
              />
            </>
          )}
          <button
            type="button"
            onClick={() => addCategory(draftName)}
            disabled={!draftName.trim()}
            className="px-3 py-2 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
        {draftSport === "FOOTBALL" && (
          <p className="text-[9px] font-mono text-deep-forest/45">
            Full time (min) and optional +extra — shown on viewer match cards at FT
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[9px] font-mono text-deep-forest/40 uppercase tracking-wider self-center mr-1">
            Quick ({sportLabel(draftSport)}):
          </span>
          {SUGGESTED_CATEGORIES.filter(
            (s) =>
              !selected.some(
                (c) =>
                  categoryKey(c) ===
                  categoryKey({ name: s, sport: draftSport })
              )
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
        if (data.error === "Admin auth is not configured") {
          throw new Error(
            "Production admin secrets missing. In Vercel → Project → Settings → Environment Variables, set ADMIN_PASSWORD and ADMIN_SECRET (secret ≥ 16 chars), then Redeploy."
          );
        }
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

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLogoUrl(await uploadImageToSupabase(file, { folder: "tournaments" }));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const clearLogo = () => {
    setLogoUrl(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (categories.length === 0) {
      alert("Add at least one category (with a sport)");
      return;
    }
    for (const c of categories) {
      if (c.sport === "CRICKET") {
        const overs = parseInt(c.oversPerInnings, 10);
        if (!overs || overs < 1 || overs > 50) {
          alert(`Cricket category "${c.name}" needs overs between 1 and 50`);
          return;
        }
      }
      if ((c.sport || "FOOTBALL") === "FOOTBALL") {
        const ft = parseInt(c.fullTimeMinutes, 10);
        if (!ft || ft < 1 || ft > 120) {
          alert(
            `Football category "${c.name}" needs full time between 1 and 120 minutes`
          );
          return;
        }
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
    setEditCategories(
      (tournament.categories || []).map((c) => ({
        name: c.name,
        sport: c.sport || "FOOTBALL",
        oversPerInnings: c.oversPerInnings ?? null,
        fullTimeMinutes:
          c.fullTimeMinutes ??
          ((c.sport || "FOOTBALL") === "FOOTBALL" ? 20 : null),
        extraTimeMinutes: c.extraTimeMinutes ?? null,
      }))
    );
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

  const handleEditLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditLogoUrl(await uploadImageToSupabase(file, { folder: "tournaments" }));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    if (editCategories.length === 0) {
      alert("Keep at least one category");
      return;
    }
    for (const c of editCategories) {
      if (c.sport === "CRICKET") {
        const overs = parseInt(c.oversPerInnings, 10);
        if (!overs || overs < 1 || overs > 50) {
          alert(`Cricket category "${c.name}" needs overs between 1 and 50`);
          return;
        }
      }
      if ((c.sport || "FOOTBALL") === "FOOTBALL") {
        const ft = parseInt(c.fullTimeMinutes, 10);
        if (!ft || ft < 1 || ft > 120) {
          alert(
            `Football category "${c.name}" needs full time between 1 and 120 minutes`
          );
          return;
        }
      }
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
          <div className="max-w-md mx-auto px-4 relative z-10 text-center space-y-3">
            <img
              src="/force-pulse-logo.png"
              alt="FORCE PULSE"
              className="w-20 h-20 mx-auto rounded-full object-cover border-2 border-mustard-gold/60 shadow-lg bg-white"
            />
            <div className="inline-flex items-center gap-2 text-mustard-gold font-mono text-[10px] font-bold uppercase tracking-widest">
              <Lock className="w-3.5 h-3.5" />
              Restricted
            </div>
            <h1 className="text-3xl font-display uppercase text-white drop-shadow">
              FORCE PULSE Admin
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
            <div className="flex flex-wrap items-center gap-2 text-mustard-gold font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest">
              <img
                src="/force-pulse-logo.png"
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-mustard-gold/50 bg-white"
              />
              <span>FORCE PULSE</span>
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
            <div className="bg-white border border-slate-200 border-t-4 border-t-mustard-gold rounded-2xl p-6 shadow-sm relative overflow-hidden">
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
                    placeholder="e.g. FORCE PULSE Championship 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                    Categories + sports
                  </label>
                  <SportCategoryEditor selected={categories} onChange={setCategories} />
                  <p className="mt-2 text-[9px] font-mono text-deep-forest/45">
                    Add multiple rows — e.g. OPEN Football, U15 Football, OPEN Cricket — each gets its own clubs and schedule.
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
              <span className="text-[10px] font-mono text-deep-forest bg-white border border-mustard-gold/30 rounded-full px-3.5 py-1 font-bold shadow-sm">
                Count: {tournaments.length}
              </span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl gap-4 shadow-sm">
                <Loader2 className="w-8 h-8 animate-spin text-mustard-gold" />
                <p className="text-xs font-mono text-deep-forest/50">Querying database...</p>
              </div>
            ) : error ? (
              <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs text-center font-mono flex items-center justify-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Error: {error}
              </div>
            ) : tournaments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 bg-white border border-slate-200 rounded-2xl gap-4 text-center px-6 relative overflow-hidden shadow-sm animate-fadeIn">
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
                        className="flex flex-col bg-white border border-slate-200 border-t-4 border-t-mustard-gold rounded-2xl p-6 shadow-md relative overflow-hidden"
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
                            <SportCategoryEditor
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
                      className="group flex flex-col bg-white border border-slate-200/80 hover:border-mustard-gold hover:shadow-md rounded-2xl p-6 transition-all duration-300 shadow-sm relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-mustard-gold rounded-l-[14px]" />

                      <div className="flex justify-between items-start gap-3 mb-4 pl-2">
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex items-center gap-3 min-w-0 flex-1"
                        >
                          {t.logoUrl ? (
                            <img
                              src={t.logoUrl}
                              alt={`${t.name} logo`}
                              className="w-12 h-12 rounded-xl object-cover border border-mustard-gold/40 shadow-sm shrink-0"
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
                              {(t.sportLabels || t.sports || []).map((label) => (
                                <span
                                  key={label}
                                  className="inline-flex items-center text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest bg-[#0d472c]/10 border border-[#0d472c]/20 rounded-md px-1.5 py-0.5"
                                >
                                  {label}
                                </span>
                              ))}
                              {(t.categories || []).map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-mustard-gold-hover bg-mustard-gold/15 border border-mustard-gold/40 rounded-md px-1.5 py-0.5"
                                >
                                  <Tags className="w-2.5 h-2.5" />
                                  {categoryDisplayName(c)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Link>
                      </div>

                      {/* Action buttons row */}
                      <div className="grid grid-cols-4 gap-2 mb-4 pt-1 pl-2">
                        <Link
                          href={`/live/${t.id}`}
                          className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 rounded-xl border border-slate-200 hover:border-emerald-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
                          aria-label={`Live board for ${t.name}`}
                          title="Public live board"
                        >
                          <Radio className="w-4 h-4" />
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wide">Live</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => startEditing(t)}
                          className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 bg-amber-50/40 hover:bg-amber-50 text-amber-800 rounded-xl border border-slate-200 hover:border-amber-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm"
                          aria-label={`Edit ${t.name}`}
                          title="Edit tournament"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wide">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(t)}
                          className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 bg-red-50/40 hover:bg-red-50 text-red-600 rounded-xl border border-slate-200 hover:border-red-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm"
                          aria-label={`Delete ${t.name}`}
                          title="Delete tournament"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wide">Delete</span>
                        </button>
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 bg-slate-50/40 hover:bg-slate-100 text-deep-forest rounded-xl border border-slate-200 hover:border-slate-300 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
                          aria-label={`Open ${t.name}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wide">Open</span>
                        </Link>
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
        <p>© 2026 FORCE PULSE</p>
      </footer>
    </div>
  );
}
