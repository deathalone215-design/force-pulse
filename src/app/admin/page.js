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
  CheckCircle2,
  UserCog,
} from "lucide-react";
import { uploadImageToSupabase } from "@/lib/imageUpload";
import { categoryDisplayName, sportLabel, isSetBasedSport } from "@/lib/sports";
import { defaultSetScoring } from "@/lib/setBasedSports";
import { isTournamentComplete } from "@/lib/tournamentDate";
import UserManagement from "./UserManagement";
import { useSequentialPoll } from "@/hooks/useSequentialPoll";

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

/** Keep "" while typing so multi-digit edits don't snap back to the default. */
function numberFieldValue(stored, fallback) {
  if (stored === "") return "";
  if (stored == null) return fallback;
  return stored;
}

function parseNumberField(raw) {
  if (raw === "") return "";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : "";
}

function finalizeNumberField(stored, { min, max, fallback }) {
  const n = parseInt(stored, 10);
  if (!Number.isFinite(n) || n < min) return fallback;
  if (n > max) return max;
  return n;
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

/** Rows: { name, sport, oversPerInnings, fullTimeMinutes, extraTimeMinutes, pointsPerSet, setsToWin, ... } */
function SportCategoryEditor({ selected, onChange, idPrefix = "cat" }) {
  const [draftName, setDraftName] = useState("");
  const [draftSport, setDraftSport] = useState("FOOTBALL");
  const [draftOvers, setDraftOvers] = useState("20");
  const [draftFullTime, setDraftFullTime] = useState("20");
  const [draftExtra, setDraftExtra] = useState("0");
  const [draftPoints, setDraftPoints] = useState("21");
  const [draftSetsToWin, setDraftSetsToWin] = useState("2");

  const normalize = (name) => name.trim().replace(/\s+/g, " ");

  const setScoringForSport = (sportId, points, sets) => {
    const defaults = defaultSetScoring(sportId);
    if (!defaults) return {};
    const pointsPerSet = parseInt(points, 10) || defaults.pointsPerSet;
    const setsToWin = parseInt(sets, 10) || defaults.setsToWin;
    return {
      pointsPerSet,
      setsToWin,
      maxSets: Math.max(setsToWin * 2 - 1, setsToWin),
      lastSetPoints:
        sportId === "VOLLEYBALL" ? defaults.lastSetPoints : pointsPerSet,
      pointCap: defaults.pointCap,
    };
  };

  const addCategory = (
    rawName,
    sport = draftSport,
    overs = draftOvers,
    fullTime = draftFullTime,
    extra = draftExtra,
    points = draftPoints,
    sets = draftSetsToWin
  ) => {
    const name = normalize(rawName);
    if (!name) return;
    const sportId = String(sport || "FOOTBALL").toUpperCase();
    const row = {
      name,
      sport: sportId,
      oversPerInnings: null,
      fullTimeMinutes: null,
      extraTimeMinutes: null,
      pointsPerSet: null,
      setsToWin: null,
      maxSets: null,
      lastSetPoints: null,
      pointCap: null,
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
    } else if (sportId === "FOOTBALL") {
      const ft = parseInt(fullTime, 10);
      if (!ft || ft < 1 || ft > 120) {
        alert("Football categories need full time between 1 and 120 minutes");
        return;
      }
      const ex = Math.max(0, Math.min(30, parseInt(extra, 10) || 0));
      row.fullTimeMinutes = ft;
      row.extraTimeMinutes = ex > 0 ? ex : null;
    } else if (isSetBasedSport(sportId)) {
      const pts = parseInt(points, 10);
      const stw = parseInt(sets, 10);
      if (!pts || pts < 1 || pts > 99) {
        alert("Set sports need points per set between 1 and 99");
        return;
      }
      if (!stw || stw < 1 || stw > 5) {
        alert("Set sports need sets-to-win between 1 and 5");
        return;
      }
      Object.assign(row, setScoringForSport(sportId, pts, stw));
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

  const onSportChange = (cat, sport) => {
    const patch = {
      sport,
      oversPerInnings: sport === "CRICKET" ? cat.oversPerInnings || 20 : null,
      fullTimeMinutes: sport === "FOOTBALL" ? cat.fullTimeMinutes || 20 : null,
      extraTimeMinutes: sport === "FOOTBALL" ? cat.extraTimeMinutes || null : null,
      pointsPerSet: null,
      setsToWin: null,
      maxSets: null,
      lastSetPoints: null,
      pointCap: null,
    };
    if (isSetBasedSport(sport)) {
      Object.assign(
        patch,
        setScoringForSport(
          sport,
          cat.pointsPerSet || defaultSetScoring(sport)?.pointsPerSet,
          cat.setsToWin || defaultSetScoring(sport)?.setsToWin
        )
      );
    }
    updateRow(cat, patch);
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
                onChange={(e) => onSportChange(cat, e.target.value)}
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
              {isSetBasedSport(cat.sport) && (
                <>
                  <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                    Points
                    <input
                      type="number"
                      min={1}
                      max={99}
                      inputMode="numeric"
                      value={numberFieldValue(
                        cat.pointsPerSet,
                        defaultSetScoring(cat.sport)?.pointsPerSet || 21
                      )}
                      onChange={(e) => {
                        const pointsPerSet = parseNumberField(e.target.value);
                        updateRow(cat, {
                          pointsPerSet,
                          lastSetPoints:
                            cat.sport === "VOLLEYBALL"
                              ? cat.lastSetPoints === ""
                                ? ""
                                : cat.lastSetPoints || 15
                              : pointsPerSet,
                        });
                      }}
                      onBlur={() => {
                        const fallback =
                          defaultSetScoring(cat.sport)?.pointsPerSet || 21;
                        const pointsPerSet = finalizeNumberField(
                          cat.pointsPerSet,
                          { min: 1, max: 99, fallback }
                        );
                        updateRow(cat, {
                          pointsPerSet,
                          lastSetPoints:
                            cat.sport === "VOLLEYBALL"
                              ? finalizeNumberField(cat.lastSetPoints, {
                                  min: 1,
                                  max: 99,
                                  fallback: 15,
                                })
                              : pointsPerSet,
                        });
                      }}
                      className="w-14 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                    Sets win
                    <input
                      type="number"
                      min={1}
                      max={5}
                      inputMode="numeric"
                      value={numberFieldValue(
                        cat.setsToWin,
                        defaultSetScoring(cat.sport)?.setsToWin || 2
                      )}
                      onChange={(e) => {
                        const setsToWin = parseNumberField(e.target.value);
                        updateRow(cat, {
                          setsToWin,
                          maxSets:
                            setsToWin === ""
                              ? cat.maxSets
                              : Math.max(setsToWin * 2 - 1, setsToWin),
                        });
                      }}
                      onBlur={() => {
                        const fallback =
                          defaultSetScoring(cat.sport)?.setsToWin || 2;
                        const setsToWin = finalizeNumberField(cat.setsToWin, {
                          min: 1,
                          max: 5,
                          fallback,
                        });
                        updateRow(cat, {
                          setsToWin,
                          maxSets: Math.max(setsToWin * 2 - 1, setsToWin),
                        });
                      }}
                      className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                    />
                  </label>
                  {cat.sport === "VOLLEYBALL" && (
                    <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                      Deciding
                      <input
                        type="number"
                        min={1}
                        max={99}
                        inputMode="numeric"
                        value={numberFieldValue(cat.lastSetPoints, 15)}
                        onChange={(e) =>
                          updateRow(cat, {
                            lastSetPoints: parseNumberField(e.target.value),
                          })
                        }
                        onBlur={() =>
                          updateRow(cat, {
                            lastSetPoints: finalizeNumberField(
                              cat.lastSetPoints,
                              { min: 1, max: 99, fallback: 15 }
                            ),
                          })
                        }
                        className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                      />
                    </label>
                  )}
                  {cat.sport === "BADMINTON" && (
                    <label className="inline-flex items-center gap-1 text-[9px] font-mono text-deep-forest/60">
                      Cap
                      <input
                        type="number"
                        min={1}
                        max={99}
                        inputMode="numeric"
                        value={numberFieldValue(cat.pointCap, 30)}
                        onChange={(e) =>
                          updateRow(cat, {
                            pointCap: parseNumberField(e.target.value),
                          })
                        }
                        onBlur={() =>
                          updateRow(cat, {
                            pointCap: finalizeNumberField(cat.pointCap, {
                              min: 1,
                              max: 99,
                              fallback: 30,
                            }),
                          })
                        }
                        className="w-12 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-mono outline-none"
                      />
                    </label>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => removeCategory(cat)}
                className="ml-auto min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                aria-label={`Remove ${cat.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 p-3 rounded-xl border border-dashed border-slate-300 bg-white/50">
        <div className="flex flex-col sm:flex-wrap sm:flex-row gap-2">
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
            placeholder="Category e.g. OPEN, U15, Singles"
            className="flex-1 min-w-[120px] w-full sm:w-auto bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2.5 text-sm text-deep-forest outline-none min-h-[44px]"
          />
          <select
            value={draftSport}
            onChange={(e) => {
              const sport = e.target.value;
              setDraftSport(sport);
              const d = defaultSetScoring(sport);
              if (d) {
                setDraftPoints(String(d.pointsPerSet));
                setDraftSetsToWin(String(d.setsToWin));
              }
            }}
            className="w-full sm:w-auto bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2.5 text-[10px] font-mono font-bold uppercase outline-none min-h-[44px]"
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
          {isSetBasedSport(draftSport) && (
            <>
              <input
                type="number"
                min={1}
                max={99}
                value={draftPoints}
                onChange={(e) => setDraftPoints(e.target.value)}
                title="Points per set / game"
                placeholder="Pts"
                className="w-16 bg-cream-bg/40 border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none"
              />
              <input
                type="number"
                min={1}
                max={5}
                value={draftSetsToWin}
                onChange={(e) => setDraftSetsToWin(e.target.value)}
                title="Sets to win match"
                placeholder="Sets"
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
        {draftSport === "CRICKET" && (
          <p className="text-[9px] font-mono text-deep-forest/45">
            Overs per innings for this category
          </p>
        )}
        {isSetBasedSport(draftSport) && (
          <p className="text-[9px] font-mono text-deep-forest/45">
            Points to win a set/game · Sets needed to win the match (e.g. 2 = best of 3)
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
              className="px-3 py-2 min-h-[44px] rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border border-dashed border-slate-300 text-deep-forest/60 hover:border-mustard-gold hover:text-deep-forest cursor-pointer"
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [adminTab, setAdminTab] = useState("tournaments");
  const [email, setEmail] = useState("");
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

  const fetchTournamentsRef = useRef(null);

  async function fetchTournaments({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/tournaments", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load tournaments");
      const data = await res.json();
      setTournaments(data);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }
  fetchTournamentsRef.current = fetchTournaments;

  useSequentialPoll(
    () => fetchTournamentsRef.current?.({ silent: true }),
    10000,
    { enabled: authenticated }
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        setAuthenticated(!!data.authenticated);
        setIsAdmin(!!data.isAdmin);
        setSessionUser(data.user || null);
      } catch {
        setAuthenticated(false);
        setIsAdmin(false);
        setSessionUser(null);
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
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
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
        throw new Error(data.error || "Invalid credentials");
      }
      const data = await res.json();
      setAuthenticated(true);
      setIsAdmin(data.role === "ADMIN" || data.user?.role === "ADMIN");
      setSessionUser(data.user || null);
      setPassword("");
      setEmail("");
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
    setIsAdmin(false);
    setSessionUser(null);
    setTournaments([]);
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
      if (isSetBasedSport(c.sport)) {
        const pts = parseInt(c.pointsPerSet, 10);
        const stw = parseInt(c.setsToWin, 10);
        if (!pts || pts < 1 || pts > 99) {
          alert(`Category "${c.name}" needs points per set between 1 and 99`);
          return;
        }
        if (!stw || stw < 1 || stw > 5) {
          alert(`Category "${c.name}" needs sets-to-win between 1 and 5`);
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
      (tournament.categories || []).map((c) => {
        const sport = c.sport || "FOOTBALL";
        const defaults = isSetBasedSport(sport) ? defaultSetScoring(sport) : null;
        return {
          name: c.name,
          sport,
          oversPerInnings: c.oversPerInnings ?? null,
          fullTimeMinutes:
            c.fullTimeMinutes ??
            (sport === "FOOTBALL" ? 20 : null),
          extraTimeMinutes: c.extraTimeMinutes ?? null,
          pointsPerSet: c.pointsPerSet ?? defaults?.pointsPerSet ?? null,
          setsToWin: c.setsToWin ?? defaults?.setsToWin ?? null,
          maxSets: c.maxSets ?? defaults?.maxSets ?? null,
          lastSetPoints: c.lastSetPoints ?? defaults?.lastSetPoints ?? null,
          pointCap: c.pointCap ?? defaults?.pointCap ?? null,
        };
      })
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
      if (isSetBasedSport(c.sport)) {
        const pts = parseInt(c.pointsPerSet, 10);
        const stw = parseInt(c.setsToWin, 10);
        if (!pts || pts < 1 || pts > 99) {
          alert(`Category "${c.name}" needs points per set between 1 and 99`);
          return;
        }
        if (!stw || stw < 1 || stw > 5) {
          alert(`Category "${c.name}" needs sets-to-win between 1 and 5`);
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
    const scrollFieldIntoView = (e) => {
      // Keep email/password above the soft keyboard on phone / APK
      requestAnimationFrame(() => {
        setTimeout(() => {
          e.target?.scrollIntoView?.({
            block: "center",
            behavior: "smooth",
          });
        }, 120);
      });
    };

    return (
      <div className="flex flex-col min-h-dvh bg-cream-bg text-deep-forest font-sans overflow-y-auto">
        <header className="pitch-stripes border-b-4 border-mustard-gold/80 relative overflow-hidden py-4 sm:py-10 safe-pad-top shrink-0">
          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          <div className="max-w-md mx-auto px-4 relative z-10 flex items-center gap-3 sm:flex-col sm:text-center sm:gap-2 sm:space-y-1">
            <img
              src="/force-pulse-logo.png"
              alt=""
              className="w-12 h-12 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-mustard-gold/70 shadow-lg bg-white shrink-0"
            />
            <div className="min-w-0 sm:space-y-2">
              <h1 className="text-2xl sm:text-4xl font-display uppercase text-white drop-shadow leading-none">
                FORCE PULSE
              </h1>
              <div className="inline-flex items-center gap-1.5 text-mustard-gold font-mono text-[10px] font-bold uppercase tracking-widest mt-1 sm:mt-0">
                <Lock className="w-3.5 h-3.5" />
                Admin
              </div>
              <p className="hidden sm:block text-sm text-white/75 font-medium">
                Sign in with your organizer email and password.
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col justify-start sm:justify-center px-4 py-5 sm:py-16 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm mx-auto bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 sm:space-y-5"
          >
            <p className="sm:hidden text-[11px] font-mono text-deep-forest/55 leading-relaxed">
              Sign in with your organizer email and password.
            </p>
            <div>
              <label
                htmlFor="admin-login-email"
                className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold"
              >
                Email
              </label>
              <input
                id="admin-login-email"
                type="email"
                required
                inputMode="email"
                enterKeyHint="next"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-4 py-3 text-base sm:text-sm outline-none min-h-[48px]"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label
                htmlFor="admin-login-password"
                className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold"
              >
                Password
              </label>
              <input
                id="admin-login-password"
                type="password"
                required
                enterKeyHint="go"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full bg-cream-bg/40 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-4 py-3 text-base sm:text-sm outline-none min-h-[48px]"
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
              className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[48px]"
            >
              {loggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Sign in
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-cream-bg text-deep-forest font-sans selection:bg-mustard-gold selection:text-deep-forest overflow-x-hidden relative safe-pad-bottom">
      <header className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-md relative overflow-hidden py-4 sm:py-8 safe-pad-top">
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 relative z-10 space-y-2.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <img
                src="/force-pulse-logo.png"
                alt=""
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border border-mustard-gold/60 bg-white shrink-0"
              />
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-display uppercase text-white leading-none tracking-wide">
                  FORCE PULSE
                </p>
                <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-mustard-gold mt-0.5">
                  Tournament Manager
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="p-2.5 sm:px-3 sm:py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-[44px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>

          {sessionUser && (
            <p className="text-[11px] sm:text-xs font-mono text-white/70 truncate">
              Signed in as <span className="text-mustard-gold font-bold">{sessionUser.name}</span>
              <span className="hidden sm:inline">
                {sessionUser.email ? ` (${sessionUser.email})` : ""}
              </span>
            </p>
          )}

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-display uppercase tracking-normal text-white drop-shadow leading-tight">
            {isAdmin ? "Set up your tournament" : "Your tournaments"}
          </h1>
          <p className="text-xs sm:text-sm text-white/80 font-medium max-w-xl hidden sm:block">
            {isAdmin
              ? "Create a tournament with one or more categories — each gets its own schedule."
              : "Open an assigned tournament to score matches, manage clubs, and build the schedule."}
          </p>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5 sm:py-12 relative z-10">
        {isAdmin && (
          <div className="tab-scroll mb-5 sm:mb-8 gap-2">
            {[
              { id: "tournaments", label: "Tournaments", icon: Trophy },
              { id: "users", label: "Users", icon: UserCog },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = adminTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAdminTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border cursor-pointer min-h-[44px] ${
                    active
                      ? "bg-mustard-gold text-deep-forest border-mustard-gold"
                      : "bg-white text-deep-forest/70 border-slate-200 hover:border-mustard-gold/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {isAdmin && adminTab === "users" ? (
          <UserManagement tournaments={tournaments} />
        ) : (
        <div className={`grid grid-cols-1 gap-6 sm:gap-10 ${isAdmin ? "lg:grid-cols-3" : ""}`}>
          {isAdmin && (
          <div className="lg:col-span-1 order-2 lg:order-1">
            <div className="bg-white border border-slate-200 border-t-4 border-t-mustard-gold rounded-2xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 sm:mb-6 border-b border-cream-bg pb-3">
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
                          className="absolute -top-2 -right-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors cursor-pointer shadow"
                          aria-label="Remove logo"
                        >
                          <X className="w-4 h-4" />
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
                  className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 duration-200 min-h-[44px]"
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
          )}

          <div className={isAdmin ? "lg:col-span-2 space-y-5 sm:space-y-6 order-1 lg:order-2" : "space-y-6"}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-bold tracking-widest uppercase font-mono text-deep-forest/60">
                {isAdmin ? "ACTIVE TOURNAMENTS" : "ASSIGNED TOURNAMENTS"}
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
                  {isAdmin
                    ? "Launch a tournament and pick categories like U15 and OPEN — each category will have its own clubs and fixtures."
                    : "No tournaments are assigned to your account yet. Ask the admin to assign you."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tournaments.map((t) => {
                  const isEditing = editingId === t.id;
                  const isDone = isTournamentComplete(t);

                  if (isEditing) {
                    if (!isAdmin) return null;
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
                                    className="absolute -top-2 -right-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 cursor-pointer shadow"
                                    aria-label="Remove logo"
                                  >
                                    <X className="w-4 h-4" />
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
                      className={`group flex flex-col bg-white border rounded-2xl p-6 transition-all duration-300 shadow-sm relative overflow-hidden ${
                        isDone
                          ? "border-slate-300/90 hover:border-slate-400 hover:shadow-md"
                          : "border-slate-200/80 hover:border-mustard-gold hover:shadow-md"
                      }`}
                    >
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[14px] ${
                          isDone ? "bg-slate-400" : "bg-mustard-gold"
                        }`}
                      />

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
                            {isDone && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 mb-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Tournament done
                              </span>
                            )}
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
                      <div className={`grid gap-2 mb-4 pt-1 pl-2 ${isAdmin ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
                        {isDone ? (
                          <Link
                            href={`/live/${t.id}`}
                            className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 min-h-[44px] bg-slate-100 hover:bg-slate-200/80 text-slate-700 rounded-xl border border-slate-300 hover:border-slate-400 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
                            aria-label={`Results for ${t.name}`}
                            title="Tournament finished — view results"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                              Done
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={`/live/${t.id}`}
                            className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 min-h-[44px] bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 rounded-xl border border-slate-200 hover:border-emerald-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
                            aria-label={`Live board for ${t.name}`}
                            title="Public live board"
                          >
                            <Radio className="w-4 h-4" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wide">
                              Live
                            </span>
                          </Link>
                        )}
                        {isAdmin && (
                        <button
                          type="button"
                          onClick={() => startEditing(t)}
                          className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 min-h-[44px] bg-amber-50/40 hover:bg-amber-50 text-amber-800 rounded-xl border border-slate-200 hover:border-amber-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm"
                          aria-label={`Edit ${t.name}`}
                          title="Edit tournament"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wide">Edit</span>
                        </button>
                        )}
                        {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(t)}
                          className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 min-h-[44px] bg-red-50/40 hover:bg-red-50 text-red-600 rounded-xl border border-slate-200 hover:border-red-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm"
                          aria-label={`Delete ${t.name}`}
                          title="Delete tournament"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wide">Delete</span>
                        </button>
                        )}
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 min-h-[44px] bg-slate-50/40 hover:bg-slate-100 text-deep-forest rounded-xl border border-slate-200 hover:border-slate-300 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
                          aria-label={`Open ${t.name}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wide">Open</span>
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
        )}
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
