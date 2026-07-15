"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Trophy, Users, Calendar, ArrowLeft, Loader2, Plus, 
  Trash2, Play, CheckCircle2, ShieldAlert, Award, FileSpreadsheet, 
  PlusCircle, X, ChevronDown, ChevronUp, Download, Eye, Clock, Activity,
  Info, Sparkles, RefreshCw, Pencil, ImagePlus
} from "lucide-react";

import { isTopScorerGoal } from "@/lib/matchEvents";
import {
  calculateCricketLeaders,
  calculateCricketStandings,
} from "@/lib/cricket";

const isPlaceholderTeam = (name) => {
  if (!name) return false;
  const norm = name.toLowerCase().trim();
  return norm.includes("tbd") || [
    "1st placed team",
    "2nd placed team",
    "3rd placed team",
    "4th placed team",
    "winner sf1",
    "winner sf2",
    "winner first",
    "winner second",
    "w1",
    "w2"
  ].some(p => norm.includes(p));
};

const getRoundName = (number, totalRounds) => {
  if (totalRounds === 4) {
    if (number === 1) return "Saturday League";
    if (number === 2) return "Sunday League";
    if (number === 3) return "Semi-Finals";
    if (number === 4) return "Final";
  }
  return `Round ${number}`;
};

export default function TournamentDashboard() {
  const { id } = useParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, teams, schedule, standings, scorers, exports
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const categoryStorageKey = id ? `md_active_category_${id}` : null;

  const selectCategory = (catId) => {
    setActiveCategoryId(catId);
    if (categoryStorageKey && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(categoryStorageKey, catId);
      } catch {
        /* ignore */
      }
    }
  };

  // Team Form State
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLogoUrl, setNewTeamLogoUrl] = useState(null);
  const [newPlayers, setNewPlayers] = useState([{ name: "", shirtNumber: "", logoUrl: null }]);
  const [addingTeam, setAddingTeam] = useState(false);
  const teamLogoInputRef = useRef(null);

  // Edit existing club (logo + add players)
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editTeamLogoUrl, setEditTeamLogoUrl] = useState(null);
  const [editPlayerName, setEditPlayerName] = useState("");
  const [editPlayerShirt, setEditPlayerShirt] = useState("");
  const [editPlayerLogoUrl, setEditPlayerLogoUrl] = useState(null);
  const [savingTeamEdit, setSavingTeamEdit] = useState(false);
  const editTeamLogoInputRef = useRef(null);
  const editPlayerLogoInputRef = useRef(null);

  const readImageAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file"));
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please select an image file"));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        reject(new Error("Image must be under 2MB"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

  // Pick real teams for a scheduled match (e.g. semi-final TBD slots)
  const [pickingMatchId, setPickingMatchId] = useState(null);
  const [pickTeamAId, setPickTeamAId] = useState("");
  const [pickTeamBId, setPickTeamBId] = useState("");
  const [savingPick, setSavingPick] = useState(false);

  const getActiveCategory = (t = tournament, catId = activeCategoryId) => {
    if (!t?.categories?.length) return null;
    return t.categories.find((c) => c.id === catId) || t.categories[0];
  };

  const openScoringConsole = (match) => {
    startTransition(() => {
      router.push(`/tournaments/${id}/matches/${match.id}`);
    });
  };

  const openTeamPicker = (match) => {
    const cat = getActiveCategory();
    const realIds = new Set(
      (cat?.teams || [])
        .filter((t) => !isPlaceholderTeam(t.name))
        .map((t) => t.id)
    );
    setPickingMatchId(match.id);
    setPickTeamAId(realIds.has(match.teamAId) ? match.teamAId : "");
    setPickTeamBId(realIds.has(match.teamBId) ? match.teamBId : "");
  };

  const cancelTeamPicker = () => {
    setPickingMatchId(null);
    setPickTeamAId("");
    setPickTeamBId("");
  };

  const handleSavePickedTeams = async (matchId) => {
    if (!pickTeamAId || !pickTeamBId) {
      alert("Pick both clubs for this match");
      return;
    }
    if (pickTeamAId === pickTeamBId) {
      alert("A team cannot play against itself");
      return;
    }

    try {
      setSavingPick(true);
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamAId: pickTeamAId, teamBId: pickTeamBId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update teams");
      }
      cancelTeamPicker();
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingPick(false);
    }
  };

  // Manual Scheduler State
  const [schedulerMode, setSchedulerMode] = useState("auto"); // auto, manual
  const [manualRounds, setManualRounds] = useState([{ number: 1, matches: [{ teamAId: "", teamBId: "" }] }]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    fetchTournamentDetails();
  }, [id]);

  const fetchTournamentDetails = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/tournaments/${id}`);
      if (!res.ok) throw new Error("Tournament not found");
      const data = await res.json();
      setTournament(data);
      setActiveCategoryId((prev) => {
        let stored = null;
        if (typeof window !== "undefined" && categoryStorageKey) {
          try {
            stored = window.localStorage.getItem(categoryStorageKey);
          } catch {
            stored = null;
          }
        }
        if (prev && data.categories?.some((c) => c.id === prev)) return prev;
        if (stored && data.categories?.some((c) => c.id === stored)) return stored;
        return data.categories?.[0]?.id || null;
      });
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleBack = () => {
    startTransition(() => {
      router.push("/admin");
    });
  };

  // Add Player Row to Team Form
  const addPlayerRow = () => {
    setNewPlayers([...newPlayers, { name: "", shirtNumber: "", logoUrl: null }]);
  };

  // Remove Player Row from Team Form
  const removePlayerRow = (index) => {
    setNewPlayers(newPlayers.filter((_, i) => i !== index));
  };

  // Update Player in Team Form
  const updatePlayerField = (index, field, value) => {
    const updated = [...newPlayers];
    updated[index][field] = value;
    setNewPlayers(updated);
  };

  // Add Team Submission
  const handleAddTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    try {
      setAddingTeam(true);
      const squad = newPlayers.filter(p => p.name.trim() !== "");
      const res = await fetch(`/api/tournaments/${id}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName,
          logoUrl: newTeamLogoUrl || null,
          players: squad,
          categoryId: activeCategoryId,
        }),
      });

      if (!res.ok) throw new Error("Failed to add team");
      
      setNewTeamName("");
      setNewTeamLogoUrl(null);
      if (teamLogoInputRef.current) teamLogoInputRef.current.value = "";
      setNewPlayers([{ name: "", shirtNumber: "", logoUrl: null }]);
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingTeam(false);
    }
  };

  const handleTeamLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setNewTeamLogoUrl(await readImageAsDataUrl(file));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleNewPlayerLogoChange = async (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const logoUrl = await readImageAsDataUrl(file);
      updatePlayerField(index, "logoUrl", logoUrl);
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const openTeamEditor = (team) => {
    setEditingTeamId(team.id);
    setEditTeamLogoUrl(team.logoUrl || null);
    setEditPlayerName("");
    setEditPlayerShirt("");
    setEditPlayerLogoUrl(null);
    if (editTeamLogoInputRef.current) editTeamLogoInputRef.current.value = "";
    if (editPlayerLogoInputRef.current) editPlayerLogoInputRef.current.value = "";
  };

  const closeTeamEditor = () => {
    setEditingTeamId(null);
    setEditTeamLogoUrl(null);
    setEditPlayerName("");
    setEditPlayerShirt("");
    setEditPlayerLogoUrl(null);
    if (editTeamLogoInputRef.current) editTeamLogoInputRef.current.value = "";
    if (editPlayerLogoInputRef.current) editPlayerLogoInputRef.current.value = "";
  };

  const handleEditTeamLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditTeamLogoUrl(await readImageAsDataUrl(file));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleEditPlayerLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditPlayerLogoUrl(await readImageAsDataUrl(file));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleExistingPlayerLogoChange = async (teamId, playerId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSavingTeamEdit(true);
      const logoUrl = await readImageAsDataUrl(file);
      const res = await fetch(
        `/api/tournaments/${id}/teams/${teamId}/players/${playerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ logoUrl }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update player photo");
      }
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
      e.target.value = "";
    }
  };

  const handleSaveTeamLogo = async (teamId) => {
    try {
      setSavingTeamEdit(true);
      const res = await fetch(`/api/tournaments/${id}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ logoUrl: editTeamLogoUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update logo");
      }
      await fetchTournamentDetails({ silent: true });
      alert("Club logo updated — it will show on the public live board.");
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  const handleAddPlayerToTeam = async (teamId) => {
    if (!editPlayerName.trim()) {
      alert("Enter a player name");
      return;
    }
    try {
      setSavingTeamEdit(true);
      const res = await fetch(`/api/tournaments/${id}/teams/${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editPlayerName.trim(),
          shirtNumber: editPlayerShirt,
          logoUrl: editPlayerLogoUrl || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add player");
      }
      setEditPlayerName("");
      setEditPlayerShirt("");
      setEditPlayerLogoUrl(null);
      if (editPlayerLogoInputRef.current) editPlayerLogoInputRef.current.value = "";
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  // Round Robin Schedule Generator
  const generateAutoSchedule = async () => {
    const cat = getActiveCategory();
    if (!cat) {
      alert("Select a category first.");
      return;
    }
    const realTeams = cat.teams ? cat.teams.filter(t => !isPlaceholderTeam(t.name)) : [];
    if (realTeams.length < 2) {
      alert("You need at least 2 teams to generate a schedule.");
      return;
    }

    if (cat.rounds.length > 0) {
      if (!window.confirm("Generating a new schedule will delete all existing matches and live scores for this category. Proceed?")) return;
    }

    try {
      setSavingSchedule(true);

      const list = [...realTeams];
      if (list.length % 2 !== 0) {
        list.push({ id: null, name: "BYE" });
      }
      const n = list.length;
      const rounds = [];
      
      for (let rIndex = 0; rIndex < n - 1; rIndex++) {
        const roundMatches = [];
        for (let i = 0; i < n / 2; i++) {
          const home = list[i];
          const away = list[n - 1 - i];
          if (home.id && away.id) {
            roundMatches.push({ teamAId: home.id, teamBId: away.id });
          }
        }
        rounds.push({
          number: rIndex + 1,
          matches: roundMatches
        });
        // Rotate (keep first fixed)
        list.splice(1, 0, list.pop());
      }

      const res = await fetch(`/api/tournaments/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds, categoryId: cat.id }),
      });

      if (!res.ok) throw new Error("Failed to save auto-schedule");
      await fetchTournamentDetails({ silent: true });
      setActiveTab("dashboard");
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Add Match to Manual Round Form
  const addManualMatch = (rIndex) => {
    const updated = [...manualRounds];
    updated[rIndex].matches.push({ teamAId: "", teamBId: "" });
    setManualRounds(updated);
  };

  // Remove Match from Manual Round Form
  const removeManualMatch = (rIndex, mIndex) => {
    const updated = [...manualRounds];
    updated[rIndex].matches = updated[rIndex].matches.filter((_, i) => i !== mIndex);
    setManualRounds(updated);
  };

  // Load current schedule into manual rounds
  const loadExistingIntoManual = () => {
    const cat = getActiveCategory();
    if (!cat || !cat.rounds || cat.rounds.length === 0) {
      alert("No current schedule to load for this category.");
      return;
    }
    const mapped = cat.rounds.map(r => ({
      number: r.number,
      matches: r.matches.map(m => ({
        teamAId: m.teamAId,
        teamBId: m.teamBId
      }))
    }));
    setManualRounds(mapped);
  };

  // Add Round to Manual Form
  const addManualRound = () => {
    setManualRounds([...manualRounds, { number: manualRounds.length + 1, matches: [{ teamAId: "", teamBId: "" }] }]);
  };

  // Remove Round from Manual Form
  const removeManualRound = (index) => {
    setManualRounds(manualRounds.filter((_, i) => i !== index).map((r, idx) => ({ ...r, number: idx + 1 })));
  };

  // Update Manual Match Selection
  const updateManualMatchField = (rIndex, mIndex, field, value) => {
    const updated = [...manualRounds];
    updated[rIndex].matches[mIndex][field] = value;
    setManualRounds(updated);
  };

  // Save Manual Schedule
  const saveManualSchedule = async (e) => {
    e.preventDefault();
    const cat = getActiveCategory();
    if (!cat) {
      alert("Select a category first.");
      return;
    }
    if (cat.rounds.length > 0) {
      if (!window.confirm("Saving a new schedule will delete all existing matches and live scores for this category. Proceed?")) return;
    }

    try {
      setSavingSchedule(true);
      for (const r of manualRounds) {
        for (const m of r.matches) {
          if (!m.teamAId || !m.teamBId) {
            throw new Error("All matches must have both teams selected.");
          }
          if (m.teamAId === m.teamBId) {
            throw new Error("A team cannot play against itself.");
          }
        }
      }

      const res = await fetch(`/api/tournaments/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds: manualRounds, categoryId: cat.id }),
      });

      if (!res.ok) throw new Error("Failed to save schedule");
      await fetchTournamentDetails({ silent: true });
      setManualRounds([{ number: 1, matches: [{ teamAId: "", teamBId: "" }] }]);
      setActiveTab("dashboard");
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Standings Calculations
  const calculateStandings = () => {
    const cat = getActiveCategory();
    if (!cat) return [];
    
    const standings = cat.teams
      .filter(team => !isPlaceholderTeam(team.name))
      .map(team => ({
        id: team.id,
        name: team.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      }));

    cat.rounds.forEach(round => {
      round.matches.forEach(match => {
        // Points table updates only when a match is marked COMPLETED
        if (match.status === "COMPLETED") {
          const homeIndex = standings.findIndex(t => t.id === match.teamAId);
          const awayIndex = standings.findIndex(t => t.id === match.teamBId);

          if (homeIndex !== -1 && awayIndex !== -1) {
            const h = standings[homeIndex];
            const a = standings[awayIndex];

            h.played += 1;
            a.played += 1;
            h.gf += match.scoreA;
            h.ga += match.scoreB;
            a.gf += match.scoreB;
            a.ga += match.scoreA;

            if (match.scoreA > match.scoreB) {
              h.won += 1;
              h.pts += 3;
              a.lost += 1;
            } else if (match.scoreA < match.scoreB) {
              a.won += 1;
              a.pts += 3;
              h.lost += 1;
            } else {
              h.drawn += 1;
              h.pts += 1;
              a.drawn += 1;
              a.pts += 1;
            }

            h.gd = h.gf - h.ga;
            a.gd = a.gf - a.ga;
          }
        }
      });
    });

    return standings.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });
  };

  // Top Goal Scorers Calculations
  const calculateTopScorers = () => {
    const cat = getActiveCategory();
    if (!cat) return [];

    const scorers = {};

    cat.rounds.forEach(round => {
      round.matches.forEach(match => {
        match.events.forEach(event => {
          // Own goals must never count toward top scorers
          if (!isTopScorerGoal(event.type) || !event.playerId || !event.player) return;
          const pId = event.playerId;
          if (!scorers[pId]) {
            const team = cat.teams.find(t => t.id === event.player.teamId);
            scorers[pId] = {
              id: pId,
              name: event.player.name,
              shirtNumber: event.player.shirtNumber,
              logoUrl: event.player.logoUrl || null,
              teamName: team ? team.name : "Unknown Team",
              goals: 0
            };
          }
          scorers[pId].goals += 1;
        });
      });
    });

    return Object.values(scorers).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  };

  // Team gradient badge helper
  const getTeamGradient = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c1 = Math.abs(hash % 360);
    const c2 = (c1 + 130) % 360;
    return `linear-gradient(135deg, hsl(${c1}, 60%, 45%), hsl(${c2}, 60%, 30%))`;
  };

  // Export to CSV helper
  const exportToCSV = (filename, headers, rows) => {
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportStandings = () => {
    if (tournament.sport === "CRICKET") {
      const cat = getActiveCategory();
      const rowsData = calculateCricketStandings(cat).filter(
        (t) => !isPlaceholderTeam(t.name)
      );
      const headers = ["Position", "Team", "Played", "Won", "Tied", "Lost", "Runs For", "Points"];
      const rows = rowsData.map((t, idx) => [
        idx + 1,
        t.name,
        t.played,
        t.won,
        t.tied,
        t.lost,
        t.runsFor,
        t.points,
      ]);
      exportToCSV(`${tournament.name.replace(/\s+/g, "_")}_Standings.csv`, headers, rows);
      return;
    }
    const standingsData = calculateStandings();
    const headers = ["Position", "Team", "Played", "Won", "Drawn", "Lost", "GF", "GA", "GD", "Points"];
    const rows = standingsData.map((t, idx) => [
      idx + 1,
      t.name,
      t.played,
      t.won,
      t.drawn,
      t.lost,
      t.gf,
      t.ga,
      t.gd,
      t.pts
    ]);
    exportToCSV(`${tournament.name.replace(/\s+/g, "_")}_Standings.csv`, headers, rows);
  };

  const handleExportScorers = () => {
    if (tournament.sport === "CRICKET") {
      const cat = getActiveCategory();
      const { runScorers, wicketTakers } = calculateCricketLeaders(cat);
      const headers = ["Rank", "Player", "Team", "Runs", "Wickets"];
      const byId = {};
      runScorers.forEach((p) => {
        byId[p.id] = { name: p.name, teamName: p.teamName, runs: p.runs, wickets: 0 };
      });
      wicketTakers.forEach((p) => {
        if (!byId[p.id]) {
          byId[p.id] = { name: p.name, teamName: p.teamName, runs: 0, wickets: p.wickets };
        } else {
          byId[p.id].wickets = p.wickets;
        }
      });
      const rows = Object.values(byId).map((p, idx) => [
        idx + 1,
        p.name,
        p.teamName,
        p.runs,
        p.wickets,
      ]);
      exportToCSV(`${tournament.name.replace(/\s+/g, "_")}_Leaders.csv`, headers, rows);
      return;
    }
    const scorers = calculateTopScorers();
    const headers = ["Rank", "Player", "Shirt #", "Team", "Goals"];
    const rows = scorers.map((p, idx) => [
      idx + 1,
      p.name,
      p.shirtNumber,
      p.teamName,
      p.goals
    ]);
    exportToCSV(`${tournament.name.replace(/\s+/g, "_")}_TopScorers.csv`, headers, rows);
  };

  if (loading || isPending) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF6EE] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#e5a93b]" />
        <p className="text-xs font-mono text-[#0a331f]/60">Querying database...</p>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF6EE] px-4 text-center">
        <ShieldAlert className="w-12 h-12 text-red-600 mb-4 animate-bounce" />
        <h2 className="text-lg font-bold text-[#0a331f] mb-2 font-mono">Dashboard Error</h2>
        <p className="text-sm text-[#0a331f]/70 mb-6 font-mono">{error || "Could not retrieve tournament details."}</p>
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#e5a93b] rounded-xl hover:bg-slate-50 text-xs font-mono text-[#0a331f] shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </button>
      </div>
    );
  }

  const activeCategory = getActiveCategory();
  const categoryTeams = activeCategory?.teams || [];
  const categoryRounds = activeCategory?.rounds || [];
  const isCricket = tournament.sport === "CRICKET";
  const footballStandings = calculateStandings();
  const cricketStandings = calculateCricketStandings(activeCategory).filter(
    (t) => !isPlaceholderTeam(t.name)
  );
  const standings = isCricket ? cricketStandings : footballStandings;
  const topScorers = calculateTopScorers();
  const cricketLeaders = isCricket
    ? calculateCricketLeaders(activeCategory)
    : { runScorers: [], wicketTakers: [] };
  const liveMatches = categoryRounds.flatMap(r => r.matches).filter(m => m.status === "LIVE");

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF6EE] text-[#0a331f] font-sans selection:bg-mustard-gold selection:text-deep-forest overflow-x-hidden relative">
      
      {/* Unified upper section: pitch stripes for header + categories + tabs */}
      <div className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />

        {/* Title bar */}
        <header className="relative z-10 py-5 sm:py-6">
          <div className="max-w-6xl mx-auto px-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={handleBack}
                title="Back to admin"
                className="p-3 border border-white/20 hover:border-white/40 bg-[#093c24]/80 text-white rounded-xl transition-all cursor-pointer shadow-sm shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              {tournament.logoUrl ? (
                <img
                  src={tournament.logoUrl}
                  alt={`${tournament.name} logo`}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover border-2 border-mustard-gold/80 shadow-sm shrink-0"
                />
              ) : null}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-mustard-gold font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wide sm:tracking-widest">
                  <span>Match Day</span>
                  <span>•</span>
                  <span>
                    {isCricket
                      ? `Cricket · ${tournament.oversPerInnings || "?"} ov`
                      : "Football"}
                  </span>
                  {activeCategory ? (
                    <>
                      <span>•</span>
                      <span>{activeCategory.name}</span>
                    </>
                  ) : null}
                </div>
                <h1 className="text-lg sm:text-2xl font-bold text-white leading-tight uppercase font-display select-none tracking-wide drop-shadow truncate">
                  {tournament.name}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Link
                href={`/live/${id}`}
                className="flex-1 sm:flex-none justify-center px-3 py-2.5 border border-mustard-gold/60 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl transition-all text-[10px] font-mono font-bold cursor-pointer flex items-center gap-1.5 min-h-[44px]"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="sm:hidden">Board</span>
                <span className="hidden sm:inline">Public Board</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Category tabs */}
        {(tournament.categories || []).length > 0 && (
          <div className="relative z-10 border-t border-white/10 py-3">
            <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-mustard-gold/80 mr-1">
                Category
              </span>
              {(tournament.categories || []).map((cat) => {
                const isActive = cat.id === activeCategory?.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      selectCategory(cat.id);
                      cancelTeamPicker();
                      setManualRounds([{ number: 1, matches: [{ teamAId: "", teamBId: "" }] }]);
                    }}
                    className={`px-3.5 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer min-h-[44px] ${
                      isActive
                        ? "bg-mustard-gold text-deep-forest border-mustard-gold shadow-sm"
                        : "bg-[#093c24]/70 text-white/85 border-white/15 hover:bg-[#093c24] hover:text-white hover:border-white/30"
                    }`}
                  >
                    {cat.name}
                    <span className="ml-1.5 opacity-60">
                      ({(cat.teams || []).filter((t) => !isPlaceholderTeam(t.name)).length})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Feature tabs */}
        <div className="relative z-10 border-t border-white/10 py-3">
          <div className="max-w-6xl mx-auto px-4 overflow-x-auto tab-scroll flex gap-2">
            {[
              { id: "dashboard", label: "Matches", short: "Matches", icon: Activity },
              { id: "teams", label: "Teams & Squads", short: "Teams", icon: Users },
              { id: "schedule", label: "Schedule Builder", short: "Schedule", icon: Calendar },
              { id: "standings", label: "Standings Table", short: "Standings", icon: Trophy },
              {
                id: "scorers",
                label: isCricket ? "Leaders Hub" : "Scorers Hub",
                short: isCricket ? "Leaders" : "Scorers",
                icon: Award,
              },
              { id: "exports", label: "Exports Desk", short: "Exports", icon: Download },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-2.5 px-3.5 sm:px-4 rounded-xl font-mono text-[10px] uppercase tracking-wider cursor-pointer whitespace-nowrap transition-all border min-h-[44px] ${
                    isActive
                      ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold shadow-sm"
                      : "bg-[#093c24]/70 text-white/85 border-white/10 hover:bg-[#093c24] hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="sm:hidden">{tab.short}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dynamic Live Banner Alert */}
      {liveMatches.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 py-2.5">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-xs font-mono font-bold text-red-750 tracking-wider">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin text-red-600" />
              <span>ATTENTION: {liveMatches.length} MATCH(ES) CURRENTLY IN PROGRESS LIVE!</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {liveMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openScoringConsole(m)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] uppercase tracking-wider cursor-pointer"
                >
                  Score {m.teamA?.name?.slice(0, 12)} vs {m.teamB?.name?.slice(0, 12)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Panels */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-10 relative z-10">
        {/* PANEL: MATCHES */}
        {activeTab === "dashboard" && (
          <div className="space-y-10 animate-fadeIn">
            {categoryRounds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white border-2 border-dashed border-mustard-gold rounded-2xl gap-4 text-center px-6 shadow-sm">
                <Calendar className="w-12 h-12 text-[#e5a93b]/70 mb-2" />
                <h3 className="text-lg font-display text-deep-forest uppercase tracking-wider">No Scheduled Fixtures</h3>
                <p className="text-xs text-deep-forest/60 max-w-sm leading-relaxed">
                  You need to construct match rounds first. Navigate to the **Schedule Builder** panel to generate fixtures.
                </p>
                <button
                  onClick={() => setActiveTab("schedule")}
                  className="px-5 py-2.5 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase rounded-xl text-[10px] font-mono transition-all shadow-sm cursor-pointer"
                >
                  Configure Schedule
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                {categoryRounds.map((round) => (
                  <div key={round.id} className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                      <span className="text-xl font-display text-deep-forest uppercase tracking-wider">{getRoundName(round.number, categoryRounds.length)}</span>
                      <span className="text-[9px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded-full px-3 py-1 uppercase font-bold shadow-sm">
                        {round.matches.length} Matches
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {round.matches.map((match) => {
                        const isLive = match.status === "LIVE";
                        const isCompleted = match.status === "COMPLETED";
                        const isScheduled = match.status === "SCHEDULED";
                        const needsTeamPick =
                          isScheduled &&
                          (isPlaceholderTeam(match.teamA?.name) ||
                            isPlaceholderTeam(match.teamB?.name));
                        const isPicking = pickingMatchId === match.id;
                        const realClubs = (categoryTeams || []).filter(
                          (t) => !isPlaceholderTeam(t.name)
                        );

                        return (
                          <div 
                            key={match.id}
                            className={`bg-white border-2 border-dashed border-mustard-gold hover:border-solid hover:shadow-md rounded-2xl p-6 transition-all duration-300 shadow-sm flex flex-col justify-between ${
                              isLive 
                                ? "border-red-300 ring-2 ring-red-100" 
                                : ""
                            }`}
                          >
                            {/* Card Status bar */}
                            <div className="flex justify-between items-center mb-6">
                              <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border tracking-wider ${
                                isLive 
                                  ? "bg-red-50 border-red-200 text-red-700 animate-pulse" 
                                  : isCompleted
                                  ? "bg-slate-100 border-slate-200 text-slate-500"
                                  : "bg-slate-50 border-slate-200/60 text-slate-400"
                              }`}>
                                {match.status}
                              </span>
                              {isLive && (
                                <div className="flex items-center gap-1.5 text-[9px] text-red-650 font-mono font-bold animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                                  SCORING OPENED
                                </div>
                              )}
                            </div>

                            {/* Score Display Grid */}
                            <div className="grid grid-cols-3 items-center gap-1.5 sm:gap-3 text-center mb-6">
                              {/* Team A Info */}
                              <div className="space-y-2 w-full min-w-0 max-w-[88px] sm:max-w-[100px] md:max-w-[140px] justify-self-center flex flex-col items-center">
                                {match.teamA?.logoUrl ? (
                                  <img
                                    src={match.teamA.logoUrl}
                                    alt={match.teamA.name}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover shadow-sm border border-white"
                                  />
                                ) : (
                                  <div 
                                    style={{ background: getTeamGradient(match.teamA.name) }}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase select-none shadow-sm border border-white"
                                  >
                                    {match.teamA.name.slice(0, 2)}
                                  </div>
                                )}
                                <span className="text-[10px] sm:text-xs font-bold text-deep-forest uppercase tracking-wide line-clamp-2 text-center h-8 flex items-center justify-center leading-tight">
                                  {match.teamA.name}
                                </span>
                              </div>

                              {/* Big Digital Scores */}
                              {isCricket ? (
                                <div className="flex flex-col items-center justify-center gap-1 text-center">
                                  <span className="text-sm sm:text-lg font-mono font-bold text-white bg-[#0a331f] border border-black px-2 py-1 rounded-lg shadow">
                                    {match.scoreA}/{match.wicketsA ?? 0}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400">vs</span>
                                  <span className="text-sm sm:text-lg font-mono font-bold text-white bg-[#0a331f] border border-black px-2 py-1 rounded-lg shadow">
                                    {match.scoreB}/{match.wicketsB ?? 0}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1 sm:gap-2">
                                  <span className="text-xl sm:text-2xl font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl shadow min-w-[36px] sm:min-w-[44px]">
                                    {match.scoreA}
                                  </span>
                                  <span className="text-slate-400 font-bold font-mono text-sm sm:text-lg">:</span>
                                  <span className="text-xl sm:text-2xl font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl shadow min-w-[36px] sm:min-w-[44px]">
                                    {match.scoreB}
                                  </span>
                                </div>
                              )}

                              {/* Team B Info */}
                              <div className="space-y-2 w-full min-w-0 max-w-[88px] sm:max-w-[100px] md:max-w-[140px] justify-self-center flex flex-col items-center">
                                {match.teamB?.logoUrl ? (
                                  <img
                                    src={match.teamB.logoUrl}
                                    alt={match.teamB.name}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover shadow-sm border border-white"
                                  />
                                ) : (
                                  <div 
                                    style={{ background: getTeamGradient(match.teamB.name) }}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase select-none shadow-sm border border-white"
                                  >
                                    {match.teamB.name.slice(0, 2)}
                                  </div>
                                )}
                                <span className="text-[10px] sm:text-xs font-bold text-deep-forest uppercase tracking-wide line-clamp-2 text-center h-8 flex items-center justify-center leading-tight">
                                  {match.teamB.name}
                                </span>
                              </div>
                            </div>

                            {/* Pick clubs from the tournament's real teams */}
                            {isPicking && (
                              <div className="mb-4 space-y-3 border border-dashed border-mustard-gold/70 rounded-xl bg-cream-bg/60 p-3">
                                <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60">
                                  Pick clubs ({realClubs.length} available)
                                </p>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <select
                                    value={pickTeamAId}
                                    onChange={(e) => setPickTeamAId(e.target.value)}
                                    className="flex-1 bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none cursor-pointer"
                                  >
                                    <option value="">-- Home club --</option>
                                    {realClubs.map((t) => (
                                      <option key={t.id} value={t.id} disabled={t.id === pickTeamBId}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-[10px] font-mono font-bold text-slate-400 text-center">VS</span>
                                  <select
                                    value={pickTeamBId}
                                    onChange={(e) => setPickTeamBId(e.target.value)}
                                    className="flex-1 bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none cursor-pointer"
                                  >
                                    <option value="">-- Away club --</option>
                                    {realClubs.map((t) => (
                                      <option key={t.id} value={t.id} disabled={t.id === pickTeamAId}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSavePickedTeams(match.id)}
                                    disabled={savingPick}
                                    className="flex-1 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl py-2 text-[10px] font-mono uppercase tracking-wider font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                                  >
                                    {savingPick ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3 h-3" />
                                    )}
                                    Save clubs
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelTeamPicker}
                                    className="px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-mono uppercase tracking-wider cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Scoring Actions */}
                            <div className="border-t border-slate-100 pt-4 flex gap-2">
                              {(isScheduled || needsTeamPick) && !isPicking && (
                                <button
                                  onClick={() => openTeamPicker(match)}
                                  className="flex-1 bg-white hover:bg-cream-bg border border-mustard-gold/50 text-deep-forest rounded-xl py-2.5 text-[10px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Users className="w-3 h-3 text-[#e5a93b]" />
                                  {needsTeamPick ? "Pick teams" : "Change teams"}
                                </button>
                              )}
                              <button
                                onClick={() => openScoringConsole(match)}
                                className="flex-1 bg-[#0d472c] hover:bg-[#0a331f] border border-[#0d472c] text-white rounded-xl py-3 text-[10px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm min-h-[44px]"
                              >
                                <Play className="w-3 h-3 text-mustard-gold fill-mustard-gold" /> Open Scorer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PANEL: TEAMS & SQUADS */}
        {activeTab === "teams" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-fadeIn">
            {/* Team Creation Form */}
            <div className="lg:col-span-1">
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
                  <Users className="w-5 h-5 text-mustard-gold" />
                  <h3 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">Register Club</h3>
                </div>

                <form onSubmit={handleAddTeam} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">Club/Team Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Manchester Red"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="w-full bg-[#FAF6EE]/50 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest placeholder-slate-400 outline-none transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                      Club Logo (shown on public live board)
                    </label>
                    <div className="flex items-center gap-3">
                      {newTeamLogoUrl ? (
                        <img
                          src={newTeamLogoUrl}
                          alt="Club logo preview"
                          className="w-14 h-14 rounded-full object-cover border-2 border-mustard-gold shadow-sm"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-cream-bg border border-dashed border-slate-300 flex items-center justify-center">
                          <Trophy className="w-5 h-5 text-slate-300" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <input
                          ref={teamLogoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleTeamLogoChange}
                          className="w-full text-[10px] font-mono text-deep-forest/70 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-mustard-gold file:text-deep-forest file:font-bold file:text-[10px] file:uppercase file:cursor-pointer"
                        />
                        {newTeamLogoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewTeamLogoUrl(null);
                              if (teamLogoInputRef.current) teamLogoInputRef.current.value = "";
                            }}
                            className="text-[9px] font-mono font-bold uppercase text-red-600 cursor-pointer"
                          >
                            Remove logo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest font-bold">Roster Squad</label>
                      <button
                        type="button"
                        onClick={addPlayerRow}
                        className="text-mustard-gold hover:text-mustard-gold-hover text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Add Player
                      </button>
                    </div>

                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      {newPlayers.map((player, idx) => (
                        <div key={idx} className="flex flex-col gap-2 bg-[#FAF6EE]/40 border border-slate-200/80 rounded-xl p-2.5">
                          <div className="flex gap-2 items-center">
                            <label className="shrink-0 cursor-pointer">
                              {player.logoUrl ? (
                                <img
                                  src={player.logoUrl}
                                  alt=""
                                  className="w-10 h-10 rounded-full object-cover border border-mustard-gold/60"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-white border border-dashed border-slate-300 flex items-center justify-center">
                                  <ImagePlus className="w-4 h-4 text-slate-300" />
                                </div>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleNewPlayerLogoChange(idx, e)}
                              />
                            </label>
                            <input
                              type="text"
                              placeholder="Player Name"
                              value={player.name}
                              onChange={(e) => updatePlayerField(idx, "name", e.target.value)}
                              className="flex-1 bg-white/70 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none transition-all"
                            />
                            <input
                              type="number"
                              placeholder="Jersey"
                              value={player.shirtNumber}
                              onChange={(e) => updatePlayerField(idx, "shirtNumber", e.target.value)}
                              className="w-20 bg-white/70 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-2 py-2 text-xs text-center text-deep-forest outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            {newPlayers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePlayerRow(idx)}
                                className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {player.logoUrl && (
                            <button
                              type="button"
                              onClick={() => updatePlayerField(idx, "logoUrl", null)}
                              className="self-start text-[9px] font-mono font-bold uppercase text-red-600 cursor-pointer"
                            >
                              Remove photo
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={addingTeam}
                    className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {addingTeam ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving Squad...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 stroke-[3px]" />
                        Confirm Registration
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Teams Directory List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-deep-forest/60 uppercase tracking-widest font-mono">Registered Clubs</h3>
                <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded px-2.5 py-0.5 font-bold shadow-sm">
                  Total Clubs: {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length}
                </span>
              </div>

              {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-neutral-400 gap-2 shadow-sm">
                  <Users className="w-10 h-10 text-slate-300" />
                  <span className="text-xs font-mono">No Clubs Drafted Yet</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).map((team) => {
                    const isEditing = editingTeamId === team.id;
                    return (
                    <div 
                      key={team.id}
                      className={`bg-white border-2 border-dashed rounded-2xl p-5 sm:p-6 shadow-sm transition-all ${
                        isEditing
                          ? "border-solid border-mustard-gold ring-2 ring-mustard-gold/30"
                          : "border-mustard-gold hover:border-solid hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {team.logoUrl ? (
                            <img
                              src={team.logoUrl}
                              alt={team.name}
                              className="w-12 h-12 rounded-full object-cover border-2 border-mustard-gold/60 shadow-sm shrink-0"
                            />
                          ) : (
                            <div 
                              style={{ background: getTeamGradient(team.name) }}
                              className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase select-none border border-white shadow-sm shrink-0"
                            >
                              {team.name.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-deep-forest uppercase text-sm tracking-wide truncate">{team.name}</h4>
                            <span className="text-[9px] font-mono text-deep-forest/60 uppercase font-bold">{team.players?.length || 0} Registered Members</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => (isEditing ? closeTeamEditor() : openTeamEditor(team))}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[9px] font-mono font-bold uppercase tracking-wider border cursor-pointer min-h-[40px] ${
                            isEditing
                              ? "bg-slate-100 border-slate-200 text-slate-600"
                              : "bg-cream-bg border-mustard-gold/50 text-deep-forest hover:bg-mustard-gold"
                          }`}
                        >
                          {isEditing ? (
                            <>
                              <X className="w-3.5 h-3.5" /> Close
                            </>
                          ) : (
                            <>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </>
                          )}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="space-y-4 mb-4 pb-4 border-b border-dashed border-mustard-gold/40">
                          {/* Upload / change photo */}
                          <div>
                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55 mb-2">
                              Club photo / logo
                            </p>
                            <div className="flex items-center gap-3">
                              {editTeamLogoUrl ? (
                                <img
                                  src={editTeamLogoUrl}
                                  alt="Logo preview"
                                  className="w-14 h-14 rounded-full object-cover border-2 border-mustard-gold shadow-sm"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-cream-bg border border-dashed border-slate-300 flex items-center justify-center">
                                  <ImagePlus className="w-5 h-5 text-slate-300" />
                                </div>
                              )}
                              <div className="flex-1 space-y-2 min-w-0">
                                <input
                                  ref={editTeamLogoInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleEditTeamLogoChange}
                                  className="w-full text-[10px] font-mono text-deep-forest/70 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-mustard-gold file:text-deep-forest file:font-bold file:text-[10px] file:uppercase file:cursor-pointer"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={savingTeamEdit || editTeamLogoUrl === (team.logoUrl || null)}
                                    onClick={() => handleSaveTeamLogo(team.id)}
                                    className="px-3 py-2 bg-[#0d472c] text-white rounded-xl text-[9px] font-mono font-bold uppercase cursor-pointer disabled:opacity-40 min-h-[36px]"
                                  >
                                    {savingTeamEdit ? "Saving…" : "Save photo"}
                                  </button>
                                  {editTeamLogoUrl && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditTeamLogoUrl(null);
                                        if (editTeamLogoInputRef.current) {
                                          editTeamLogoInputRef.current.value = "";
                                        }
                                      }}
                                      className="px-3 py-2 text-[9px] font-mono font-bold uppercase text-red-600 cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Add player */}
                          <div>
                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55 mb-2">
                              Add player
                            </p>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <label className="shrink-0 cursor-pointer">
                                  {editPlayerLogoUrl ? (
                                    <img
                                      src={editPlayerLogoUrl}
                                      alt=""
                                      className="w-11 h-11 rounded-full object-cover border-2 border-mustard-gold"
                                    />
                                  ) : (
                                    <div className="w-11 h-11 rounded-full bg-cream-bg border border-dashed border-slate-300 flex items-center justify-center">
                                      <ImagePlus className="w-4 h-4 text-slate-300" />
                                    </div>
                                  )}
                                  <input
                                    ref={editPlayerLogoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleEditPlayerLogoChange}
                                  />
                                </label>
                                <input
                                  type="text"
                                  placeholder="Player name"
                                  value={editPlayerName}
                                  onChange={(e) => setEditPlayerName(e.target.value)}
                                  className="flex-1 bg-[#FAF6EE]/50 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs outline-none"
                                />
                                <input
                                  type="number"
                                  placeholder="No."
                                  value={editPlayerShirt}
                                  onChange={(e) => setEditPlayerShirt(e.target.value)}
                                  className="w-20 bg-[#FAF6EE]/50 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={savingTeamEdit}
                                  onClick={() => handleAddPlayerToTeam(team.id)}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest rounded-xl text-[9px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50 min-h-[40px]"
                                >
                                  <PlusCircle className="w-3.5 h-3.5" />
                                  Add
                                </button>
                                {editPlayerLogoUrl && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditPlayerLogoUrl(null);
                                      if (editPlayerLogoInputRef.current) {
                                        editPlayerLogoInputRef.current.value = "";
                                      }
                                    }}
                                    className="text-[9px] font-mono font-bold uppercase text-red-600 cursor-pointer"
                                  >
                                    Clear photo
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {team.players && team.players.length > 0 ? (
                          team.players.map((p) => (
                            <div key={p.id} className="flex justify-between items-center gap-2 text-xs font-mono text-[#3f6b55] bg-[#fcf7ed] border border-transparent hover:border-slate-200 rounded-lg px-3 py-2 transition-all">
                              <div className="flex items-center gap-2 min-w-0">
                                {isEditing ? (
                                  <label className="shrink-0 cursor-pointer" title="Upload player photo">
                                    {p.logoUrl ? (
                                      <img
                                        src={p.logoUrl}
                                        alt=""
                                        className="w-8 h-8 rounded-full object-cover border border-mustard-gold/50"
                                      />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-white border border-dashed border-slate-300 flex items-center justify-center">
                                        <ImagePlus className="w-3.5 h-3.5 text-slate-300" />
                                      </div>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={savingTeamEdit}
                                      onChange={(e) => handleExistingPlayerLogoChange(team.id, p.id, e)}
                                    />
                                  </label>
                                ) : p.logoUrl ? (
                                  <img
                                    src={p.logoUrl}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover border border-mustard-gold/40 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[9px] font-bold text-deep-forest/50 shrink-0">
                                    {p.name.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                                <span className="truncate font-sans font-bold">{p.name}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-bold text-deep-forest bg-mustard-gold/15 border border-mustard-gold/30 rounded px-1.5 py-0.5 shrink-0">
                                <span>No.</span>
                                <span>{p.shirtNumber}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-xs font-mono text-neutral-400">
                            Roster Sheet Empty — tap Edit to add players
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PANEL: SCHEDULE BUILDER */}
        {activeTab === "schedule" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Generator Selection Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 border-b border-slate-200 pb-4">
              <button
                onClick={() => setSchedulerMode("auto")}
                className={`px-4 py-2.5 border rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer min-h-[44px] ${
                  schedulerMode === "auto" 
                    ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold shadow-sm" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                }`}
              >
                <span className="sm:hidden">Auto Generator</span>
                <span className="hidden sm:inline">League Formatted Generator</span>
              </button>
              <button
                onClick={() => setSchedulerMode("manual")}
                className={`px-4 py-2.5 border rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer min-h-[44px] ${
                  schedulerMode === "manual" 
                    ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold shadow-sm" 
                    : "bg-white text-slate-550 border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                }`}
              >
                <span className="sm:hidden">Manual Builder</span>
                <span className="hidden sm:inline">Manual Entry Builder</span>
              </button>
            </div>

            {/* AUTO ROUND ROBIN BUILDER */}
            {schedulerMode === "auto" && (
              <div className="max-w-2xl bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 space-y-6 shadow-sm relative overflow-hidden">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-mustard-gold">
                    <Sparkles className="w-4 h-4 text-mustard-gold" />
                    <h3 className="text-xs font-bold uppercase tracking-wider font-mono">League Formatted Fixtures</h3>
                  </div>
                  <p className="text-xs text-deep-forest/70 leading-relaxed">
                    This algorithm generates a complete league formatted schedule matching every team against each other exactly once. It handles odd numbers of teams automatically using placeholder bye states.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-cream-bg space-y-3 shadow-inner">
                  <div className="flex justify-between items-center text-xs font-mono border-b border-slate-200 pb-2">
                    <span className="text-deep-forest/50">Total Registered Teams</span>
                    <span className="text-deep-forest font-bold">{categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length} Clubs</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).map(team => (
                      <span key={team.id} className="text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-deep-forest flex items-center gap-2 shadow-sm">
                        <span 
                          style={{ background: getTeamGradient(team.name) }} 
                          className="w-2.5 h-2.5 rounded-full" 
                        />
                        {team.name}
                      </span>
                    ))}
                  </div>
                </div>

                {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length < 2 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-150 text-yellow-750 rounded-xl text-xs font-mono flex items-center gap-2">
                    <Info className="w-4 h-4 text-yellow-600" /> You require at least 2 clubs registered to compile fixtures.
                  </div>
                ) : (
                  <button
                    onClick={generateAutoSchedule}
                    disabled={savingSchedule}
                    className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingSchedule ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-deep-forest" />
                        Generating Fixtures...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-deep-forest text-deep-forest" />
                        Generate & Publish Schedule
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* MANUAL BUILDER */}
            {schedulerMode === "manual" && (
              <form onSubmit={saveManualSchedule} className="space-y-6 max-w-3xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <h3 className="text-xs font-bold text-deep-forest/60 uppercase tracking-widest font-mono">Manual Round Planner</h3>
                  <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
                    {categoryRounds && categoryRounds.length > 0 && (
                      <button
                        type="button"
                        onClick={loadExistingIntoManual}
                        className="text-emerald-700 hover:text-emerald-800 text-[10px] font-mono font-bold flex items-center gap-1.5 cursor-pointer py-2"
                      >
                        <RefreshCw className="w-4 h-4" /> Load Current Schedule
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={addManualRound}
                      className="text-mustard-gold hover:text-mustard-gold-hover text-[10px] font-mono font-bold flex items-center gap-1.5 cursor-pointer py-2"
                    >
                      <PlusCircle className="w-4 h-4" /> Add Round Column
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {manualRounds.map((round, rIndex) => (
                    <div key={rIndex} className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-5 shadow-sm relative">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                        <h4 className="font-bold text-deep-forest font-mono text-xs uppercase tracking-wider">Round {round.number}</h4>
                        {manualRounds.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeManualRound(rIndex)}
                            className="text-red-500 hover:text-red-650 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove Round
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        {round.matches.map((match, mIndex) => (
                          <div key={mIndex} className="flex flex-col md:flex-row md:items-center gap-3 bg-cream-bg p-3.5 rounded-xl border border-slate-200 hover:border-slate-350 transition-all">
                            <div className="flex justify-between items-center w-full md:w-auto">
                              <span className="text-[9px] font-mono text-deep-forest bg-white border border-slate-200 px-2 py-1 rounded uppercase">Match {mIndex + 1}</span>
                              {round.matches.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeManualMatch(rIndex, mIndex)}
                                  className="text-slate-400 hover:text-red-550 p-1 cursor-pointer md:hidden"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            
                            <div className="flex flex-1 flex-col sm:flex-row items-center gap-2 w-full">
                              {/* Team A Dropdown */}
                              <select
                                required
                                value={match.teamAId}
                                onChange={(e) => updateManualMatchField(rIndex, mIndex, "teamAId", e.target.value)}
                                className="w-full sm:flex-1 bg-white border border-slate-200 hover:border-slate-350 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none transition-all cursor-pointer shadow-sm"
                              >
                                <option value="">-- Choose Home Club --</option>
                                {categoryTeams
                                  .filter((t) => !isPlaceholderTeam(t.name))
                                  .map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>

                              <span className="text-slate-400 font-mono text-xs font-bold my-1 sm:my-0">VS</span>

                              {/* Team B Dropdown */}
                              <select
                                required
                                value={match.teamBId}
                                onChange={(e) => updateManualMatchField(rIndex, mIndex, "teamBId", e.target.value)}
                                className="w-full sm:flex-1 bg-white border border-slate-200 hover:border-slate-350 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none transition-all cursor-pointer shadow-sm"
                              >
                                <option value="">-- Choose Away Club --</option>
                                {categoryTeams
                                  .filter((t) => !isPlaceholderTeam(t.name))
                                  .map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>

                            {round.matches.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeManualMatch(rIndex, mIndex)}
                                className="text-slate-400 hover:text-red-550 p-1 cursor-pointer hidden md:block"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => addManualMatch(rIndex)}
                        className="mt-4 text-slate-500 hover:text-slate-700 hover:underline text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Row to Round
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingSchedule ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving Schedule...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Save & Publish Manual Schedule
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* PANEL: STANDINGS */}
        {activeTab === "standings" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
              <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono">League Standings</h3>
              <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded px-3 py-1.5 font-bold w-fit">
                {isCricket ? "W=2 PTS, T=1 PTS, L=0 PTS" : "W=3 PTS, D=1 PTS, L=0 PTS"}
              </span>
            </div>

            {standings.length === 0 ? (
              <div className="text-center py-20 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-slate-400 font-mono text-xs shadow-sm">
                No standings data available. Add clubs and generate schedules.
              </div>
            ) : (
              <div className="space-y-8">
                {/* Points Table */}
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden shadow-sm p-6 space-y-4">
                  <h4 className="text-2xl font-display text-deep-forest uppercase tracking-normal select-none mb-4">
                    Points table
                  </h4>

                  <div className="overflow-x-auto tab-scroll">
                    <p className="sm:hidden text-[9px] font-mono text-deep-forest/40 mb-2">
                      Swipe sideways for full table →
                    </p>
                    <table className="w-full text-left border-collapse text-xs font-mono min-w-[640px]">
                      <thead>
                        <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold border-b border-[#0a331f]">
                          <th className="py-3 px-4 w-14 text-center">#</th>
                          <th className="py-3 px-4 font-sans text-sm tracking-wide">Team</th>
                          <th className="py-3 px-3 text-center w-14">P</th>
                          <th className="py-3 px-3 text-center w-14">W</th>
                          <th className="py-3 px-3 text-center w-14">{isCricket ? "T" : "D"}</th>
                          <th className="py-3 px-3 text-center w-14">L</th>
                          {isCricket ? (
                            <th className="py-3 px-3 text-center w-14">RF</th>
                          ) : (
                            <>
                              <th className="py-3 px-3 text-center w-14">GF</th>
                              <th className="py-3 px-3 text-center w-14">GA</th>
                              <th className="py-3 px-3 text-center w-14">GD</th>
                            </>
                          )}
                          <th className="py-3 px-5 text-center w-20 font-bold bg-[#062416] text-[#e5a93b] border-l border-[#0a331f]">Pts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#faf6ee] text-[#0a331f]">
                        {standings.map((t, idx) => {
                          return (
                            <tr key={t.id} className="bg-[#fcf7ed] hover:bg-amber-50/40 transition-colors">
                              <td className="py-3 px-4 text-center font-bold text-xs">{idx + 1}</td>
                              <td className="py-3 px-4 font-bold font-sans flex items-center gap-3 text-sm text-[#0a331f]">
                                <div 
                                  style={{ background: getTeamGradient(t.name) }}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] text-white font-bold uppercase select-none border border-white shadow-sm"
                                >
                                  {t.name.slice(0, 2)}
                                </div>
                                <span className="truncate max-w-[160px] md:max-w-xs uppercase tracking-wide">{t.name}</span>
                              </td>
                              <td className="py-3 px-3 text-center">{t.played}</td>
                              <td className="py-3 px-3 text-center">{t.won}</td>
                              <td className="py-3 px-3 text-center">{isCricket ? t.tied : t.drawn}</td>
                              <td className="py-3 px-3 text-center">{t.lost}</td>
                              {isCricket ? (
                                <td className="py-3 px-3 text-center text-slate-500">{t.runsFor}</td>
                              ) : (
                                <>
                                  <td className="py-3 px-3 text-center text-slate-500">{t.gf}</td>
                                  <td className="py-3 px-3 text-center text-slate-500">{t.ga}</td>
                                  <td className={`py-3 px-3 text-center font-bold ${t.gd > 0 ? "text-emerald-700" : t.gd < 0 ? "text-red-500" : "text-[#0a331f]/70"}`}>
                                    {t.gd > 0 ? `+${t.gd}` : t.gd}
                                  </td>
                                </>
                              )}
                              <td className="py-3 px-5 text-center font-bold bg-[#062416]/10 text-deep-forest border-l border-[#093c24]/20 text-sm">
                                {isCricket ? t.points : t.pts}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 pt-2 border-t border-dotted border-slate-200">
                    {isCricket
                      ? "Win = 2 pts · Tie = 1 pt · Loss = 0 pts"
                      : "Win = 3 pts · Draw = 1 pt · Loss = 0 pts"}
                  </div>
                </div>

                {/* Top Scorers inside Standings */}
                {!isCricket && topScorers.length > 0 && (
                  <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-sm space-y-4">
                    <h4 className="text-2xl font-display text-deep-forest uppercase tracking-normal select-none mb-4">
                      Top scorers
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold border-b border-[#0a331f]">
                            <th className="py-3 px-4 w-20 text-center">Rank</th>
                            <th className="py-3 px-4 text-xs font-sans font-bold">Player Profile</th>
                            <th className="py-3 px-4 text-xs font-sans font-bold">Club Roster</th>
                            <th className="py-3 px-5 text-center w-28 text-white font-bold bg-[#062416] border-l border-[#0a331f]">Goals</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#faf6ee] text-[#0a331f]">
                          {topScorers.slice(0, 10).map((p, idx) => {
                            const isFirst = idx === 0;
                            const isSecond = idx === 1;
                            const isThird = idx === 2;
                            return (
                              <tr key={p.id} className="bg-[#fcf7ed] hover:bg-amber-50/40 transition-colors">
                                <td className="py-3 px-4 text-center">
                                  {isFirst ? (
                                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center mx-auto text-xs border border-amber-250 shadow-sm">🥇</span>
                                  ) : isSecond ? (
                                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center mx-auto text-xs border border-slate-200 shadow-sm">🥈</span>
                                  ) : isThird ? (
                                    <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-900 font-bold flex items-center justify-center mx-auto text-xs border border-amber-150 shadow-sm">🥉</span>
                                  ) : (
                                    <span className="text-slate-450 font-bold text-xs">{idx + 1}</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 font-bold text-[#0a331f] flex items-center gap-2 text-sm font-sans">
                                  {p.logoUrl ? (
                                    <img
                                      src={p.logoUrl}
                                      alt=""
                                      className="w-7 h-7 rounded-full object-cover border border-mustard-gold/50 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 text-[8px] font-mono text-deep-forest rounded font-bold shrink-0">
                                      {p.shirtNumber}
                                    </div>
                                  )}
                                  <span>{p.name}</span>
                                </td>
                                <td className="py-3.5 px-4 text-slate-650 font-sans font-medium uppercase tracking-wide">{p.teamName}</td>
                                <td className="py-3.5 px-5 text-center font-bold bg-[#062416]/10 text-deep-forest border-l border-[#093c24]/20 text-sm font-mono">{p.goals}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PANEL: TOP SCORERS / CRICKET LEADERS */}
        {activeTab === "scorers" && isCricket && (
          <div className="space-y-8 animate-fadeIn">
            <div>
              <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono mb-4">
                Top run-scorers
              </h3>
              {cricketLeaders.runScorers.length === 0 ? (
                <div className="text-center py-12 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-xs font-mono text-slate-400">
                  No runs recorded yet
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4 text-left">Player</th>
                        <th className="py-3 px-4 text-left">Club</th>
                        <th className="py-3 px-4 text-center">Runs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cricketLeaders.runScorers.map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed] border-t border-[#faf6ee]">
                          <td className="py-3 px-4 text-center font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold">{p.name}</td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.runs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono mb-4">
                Top wicket-takers
              </h3>
              {cricketLeaders.wicketTakers.length === 0 ? (
                <div className="text-center py-12 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-xs font-mono text-slate-400">
                  No wickets recorded yet
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4 text-left">Player</th>
                        <th className="py-3 px-4 text-left">Club</th>
                        <th className="py-3 px-4 text-center">Wkts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cricketLeaders.wicketTakers.map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed] border-t border-[#faf6ee]">
                          <td className="py-3 px-4 text-center font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold">{p.name}</td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.wickets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "scorers" && !isCricket && (
          <div className="space-y-6 animate-fadeIn">
            <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono font-bold">Golden Boot Leaderboard</h3>
            <p className="text-[10px] font-mono text-deep-forest/45 -mt-2">
              Own goals are not counted toward goals
            </p>

            {topScorers.length === 0 ? (
              <div className="text-center py-20 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-slate-400 font-mono text-xs shadow-sm p-6">
                <h4 className="text-2xl font-display text-deep-forest uppercase tracking-normal select-none mb-4">
                  Top scorers
                </h4>
                <div className="text-xs font-mono text-slate-550 border-t border-dotted border-slate-200 pt-4">
                  No goals recorded yet
                </div>
              </div>
            ) : (
              <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 shadow-sm max-w-3xl mx-auto space-y-4">
                <h4 className="text-2xl font-display text-deep-forest uppercase tracking-normal select-none mb-4">
                  Top scorers
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase font-bold border-b border-[#0a331f]">
                        <th className="py-3 px-4 w-20 text-center">Rank</th>
                        <th className="py-3 px-4 text-xs font-sans font-bold">Player Profile</th>
                        <th className="py-3 px-4 text-xs font-sans font-bold">Club Roster</th>
                        <th className="py-3 px-5 text-center w-28 text-white font-bold bg-[#062416] border-l border-[#0a331f]">Goals</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#faf6ee] text-[#0a331f]">
                      {topScorers.map((p, idx) => {
                        const isFirst = idx === 0;
                        const isSecond = idx === 1;
                        const isThird = idx === 2;
                        return (
                          <tr key={p.id} className="bg-[#fcf7ed] hover:bg-amber-50/40 transition-colors">
                            <td className="py-3 px-4 text-center">
                              {isFirst ? (
                                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center mx-auto text-xs border border-amber-250 shadow-sm">🥇</span>
                              ) : isSecond ? (
                                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center mx-auto text-xs border border-slate-200 shadow-sm">🥈</span>
                              ) : isThird ? (
                                <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-900 font-bold flex items-center justify-center mx-auto text-xs border border-amber-150 shadow-sm">🥉</span>
                              ) : (
                                <span className="text-slate-450 font-bold text-xs">{idx + 1}</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-[#0a331f] flex items-center gap-2 text-sm font-sans">
                              {p.logoUrl ? (
                                <img
                                  src={p.logoUrl}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover border border-mustard-gold/50 shrink-0"
                                />
                              ) : (
                                <div className="w-5 h-5 flex items-center justify-center bg-white border border-slate-200 text-[8px] font-mono text-deep-forest rounded font-bold shrink-0">
                                  {p.shirtNumber}
                                </div>
                              )}
                              <span>{p.name}</span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-650 font-sans font-medium uppercase tracking-wide">{p.teamName}</td>
                            <td className="py-3.5 px-5 text-center font-bold bg-[#062416]/10 text-deep-forest border-l border-[#093c24]/20 text-sm font-mono">{p.goals}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] font-mono text-slate-500 pt-2 border-t border-dotted border-slate-200">
                  Goals are registered and compiled in real-time during live match events.
                </div>
              </div>
            )}
          </div>
        )}

        {/* PANEL: EXPORTS */}
        {activeTab === "exports" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto animate-fadeIn">
            {/* Standings Export */}
            <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-cream-bg border border-slate-200 flex items-center justify-center text-mustard-gold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">League Table Sheet</h4>
                <p className="text-xs text-deep-forest/75 leading-relaxed">
                  Downloads current standing matrix metrics (Wins, Draws, Losses, Goals, Differences, Points) to a CSV dataset openable in MS Excel/Google Sheets.
                </p>
              </div>

              <button
                onClick={handleExportStandings}
                disabled={standings.length === 0}
                className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3 rounded-xl text-[10px] font-mono transition-all shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5px]" />
                Export Standings (CSV)
              </button>
            </div>

            {/* Top Scorers Export */}
            <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-cream-bg border border-slate-200 flex items-center justify-center text-mustard-gold">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">Golden Boot Database</h4>
                <p className="text-xs text-deep-forest/75 leading-relaxed">
                  Downloads full goal scoring ranking sheets containing player credentials, shirt numbers, club rosters, and goal totals.
                </p>
              </div>

              <button
                onClick={handleExportScorers}
                disabled={topScorers.length === 0}
                className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3 rounded-xl text-[10px] font-mono transition-all shadow flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5px]" />
                Export Leaderboard (CSV)
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-[10px] font-mono text-slate-450 tracking-wider">
        <p>© 2026 MATCH DAY SCORER • POWERED BY GEMINI DEVELOPER AGENT</p>
      </footer>
    </div>
  );
}
