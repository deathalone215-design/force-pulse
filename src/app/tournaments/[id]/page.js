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
import { uploadImageToSupabase } from "@/lib/imageUpload";
import { formatScheduledAt } from "@/lib/tournamentDate";
import { categoryDisplayName, isCricketSport, isSetBasedSport, isSinglesCategory, isDoublesOrMixedCategory, entryLabel, entryLabelPlural, resolveTeamLogo } from "@/lib/sports";
import { calculateSetBasedStandings } from "@/lib/setBasedSports";
import { isPlaceholderTeam, buildFootballStandings } from "@/lib/tournamentResolver";
import {
  SCHEDULE_FORMATS,
  generateScheduleRounds,
  generateSwissRound,
  getRoundDisplayName,
  normalizeScheduleFormat,
  scheduleFormatHelp,
  scheduleFormatLabel,
  suggestedSwissRounds,
} from "@/lib/scheduleFormats";
import {
  formatFootballClock,
  footballElapsedSeconds,
  footballClockOpts,
  completedFootballClockLabel,
} from "@/lib/footballClock";
import { useSequentialPoll } from "@/hooks/useSequentialPoll";

const getRoundName = (number, totalRounds, format, customName) =>
  getRoundDisplayName(number, totalRounds, format, customName);

/** ISO/date → value for <input type="datetime-local"> in the admin's timezone. */
function toDateTimeInputValue(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function matchCardClockLabel(match, now = Date.now(), category = null, tournamentId = null) {
  if (!match) return null;
  if (match.status === "COMPLETED") {
    return completedFootballClockLabel({
      fullTimeMinutes: category?.fullTimeMinutes,
      extraTimeMinutes: category?.extraTimeMinutes,
      stoppageMinutes: match.stoppageMinutes,
      tournamentId,
      kickoffAt: match.kickoffAt,
      clockOpts: footballClockOpts(match),
      now,
    });
  }
  if (!match.kickoffAt) return null;
  return formatFootballClock(
    footballElapsedSeconds(match.kickoffAt, now, footballClockOpts(match))
  );
}

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

  // Edit existing club (name, logo + add players)
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamLogoUrl, setEditTeamLogoUrl] = useState(null);
  const [editPlayerName, setEditPlayerName] = useState("");
  const [editPlayerShirt, setEditPlayerShirt] = useState("");
  const [editPlayerLogoUrl, setEditPlayerLogoUrl] = useState(null);
  const [savingTeamEdit, setSavingTeamEdit] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editExistingPlayerName, setEditExistingPlayerName] = useState("");
  const [editExistingPlayerShirt, setEditExistingPlayerShirt] = useState("");
  const editTeamLogoInputRef = useRef(null);
  const editPlayerLogoInputRef = useRef(null);

  const processImageFile = async (file, folder) =>
    uploadImageToSupabase(file, { folder, maxSide: 1024, quality: 0.82 });

  // Pick real teams for a scheduled match (e.g. semi-final TBD slots)
  const [pickingMatchId, setPickingMatchId] = useState(null);
  const [pickTeamAId, setPickTeamAId] = useState("");
  const [pickTeamBId, setPickTeamBId] = useState("");
  const [savingPick, setSavingPick] = useState(false);
  const [boardClockNow, setBoardClockNow] = useState(() => Date.now());

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
      alert(
        isSinglesCategory(getActiveCategory())
          ? "Pick both players for this match"
          : isDoublesOrMixedCategory(getActiveCategory())
            ? "Pick both pairs for this match"
            : "Pick both clubs for this match"
      );
      return;
    }
    if (pickTeamAId === pickTeamBId) {
      alert("Cannot play against the same entry");
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
  const [scheduleFormat, setScheduleFormat] = useState("ROUND_ROBIN");
  const [manualRounds, setManualRounds] = useState([{ number: 1, name: "Round 1", matches: [{ teamAId: "", teamBId: "", scheduledAt: "" }] }]);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchDetailsRef = useRef(null);

  async function fetchTournamentDetails({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/tournaments/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.detail || body?.error || `Tournament load failed (${res.status})`
        );
      }
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
  }
  fetchDetailsRef.current = fetchTournamentDetails;

  useSequentialPoll(
    () => fetchDetailsRef.current?.({ silent: true }),
    10000
  );

  useEffect(() => {
    fetchTournamentDetails();
  }, [id]);

  // Keep format picker in sync with active category
  useEffect(() => {
    const cat = getActiveCategory();
    if (cat?.scheduleFormat) {
      setScheduleFormat(normalizeScheduleFormat(cat.scheduleFormat));
    }
  }, [tournament, activeCategoryId]);

  // Tick match-card clocks while any football match is LIVE
  useEffect(() => {
    const cat = getActiveCategory();
    if (isCricketSport(cat?.sport)) return undefined;
    const hasLiveClock = (cat?.rounds || []).some((r) =>
      (r.matches || []).some(
        (m) => m.status === "LIVE" && m.kickoffAt && !m.clockPausedAt
      )
    );
    if (!hasLiveClock) return undefined;
    const timer = setInterval(() => setBoardClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tournament, activeCategoryId]);

  // Set-based sports (badminton / pickleball) have no football Scorers Hub
  useEffect(() => {
    const cat = getActiveCategory();
    if (isSetBasedSport(cat?.sport) && activeTab === "scorers") {
      setActiveTab("standings");
    }
  }, [tournament, activeCategoryId, activeTab]);

  const handleBack = () => {
    startTransition(() => {
      router.push("/admin");
    });
  };

  // Keep register form rows aligned with category type (player / pair / club)
  useEffect(() => {
    const cat = getActiveCategory();
    if (isSinglesCategory(cat)) {
      setNewPlayers([]);
    } else if (isDoublesOrMixedCategory(cat)) {
      setNewPlayers([
        { name: "", shirtNumber: "1", logoUrl: null },
        { name: "", shirtNumber: "2", logoUrl: null },
      ]);
    } else {
      setNewPlayers([{ name: "", shirtNumber: "", logoUrl: null }]);
    }
    setNewTeamName("");
    setNewTeamLogoUrl(null);
    if (teamLogoInputRef.current) teamLogoInputRef.current.value = "";
    closeTeamEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId]);

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
    const cat = getActiveCategory();
    const label = entryLabel(cat).toLowerCase();
    if (!newTeamName.trim()) {
      alert(
        isSinglesCategory(cat)
          ? "Enter a player name"
          : isDoublesOrMixedCategory(cat)
            ? "Enter a pair name (e.g. Alex / Jordan)"
            : "Enter a club / team name"
      );
      return;
    }
    if (!activeCategoryId) {
      alert("Select a category first");
      return;
    }

    try {
      setAddingTeam(true);
      const trimmedName = newTeamName.trim();
      let squad;
      let logoUrl = newTeamLogoUrl || null;

      if (isSinglesCategory(cat)) {
        squad = [
          {
            name: trimmedName,
            shirtNumber: 1,
            logoUrl,
          },
        ];
      } else if (isDoublesOrMixedCategory(cat)) {
        squad = newPlayers
          .filter((p) => p.name.trim() !== "")
          .map((p, i) => ({
            name: p.name.trim(),
            shirtNumber: p.shirtNumber || i + 1,
            logoUrl: p.logoUrl || null,
          }));
        if (squad.length !== 2) {
          alert("Doubles / Mixed needs exactly 2 players");
          setAddingTeam(false);
          return;
        }
      } else {
        squad = newPlayers
          .filter((p) => p.name.trim() !== "")
          .map((p) => ({
            name: p.name.trim(),
            shirtNumber: p.shirtNumber,
            logoUrl: p.logoUrl || null,
          }));
      }

      const res = await fetch(`/api/tournaments/${id}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          logoUrl,
          players: squad,
          categoryId: activeCategoryId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to register ${label}`);
      }

      setNewTeamName("");
      setNewTeamLogoUrl(null);
      if (teamLogoInputRef.current) teamLogoInputRef.current.value = "";
      if (isDoublesOrMixedCategory(cat)) {
        setNewPlayers([
          { name: "", shirtNumber: "1", logoUrl: null },
          { name: "", shirtNumber: "2", logoUrl: null },
        ]);
      } else if (!isSinglesCategory(cat)) {
        setNewPlayers([{ name: "", shirtNumber: "", logoUrl: null }]);
      } else {
        setNewPlayers([]);
      }
      await fetchTournamentDetails({ silent: true });
      alert(
        isSinglesCategory(cat)
          ? "Player registered."
          : isDoublesOrMixedCategory(cat)
            ? "Pair registered."
            : squad.length
              ? `Club registered with ${squad.length} player${squad.length === 1 ? "" : "s"}.`
              : "Club registered. You can add players anytime via Edit."
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingTeam(false);
    }
  };

  /** Keep the linked Player row in sync for Singles entries. */
  const syncSinglesLinkedPlayer = async (team, { name, logoUrl } = {}) => {
    if (!isSinglesCategory(getActiveCategory())) return;
    const player = team?.players?.[0];
    if (!player) {
      if (!name && !team?.name) return;
      await fetch(`/api/tournaments/${id}/teams/${team.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name || team.name,
          shirtNumber: 1,
          logoUrl: logoUrl !== undefined ? logoUrl : team.logoUrl || null,
        }),
      });
      return;
    }
    const body = {};
    if (name !== undefined) body.name = name;
    if (logoUrl !== undefined) body.logoUrl = logoUrl;
    if (Object.keys(body).length === 0) return;
    await fetch(
      `/api/tournaments/${id}/teams/${team.id}/players/${player.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }
    );
  };

  const handleTeamLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const folder = isSinglesCategory(getActiveCategory()) ? "players" : "clubs";
      setNewTeamLogoUrl(await processImageFile(file, folder));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleNewPlayerLogoChange = async (index, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const logoUrl = await processImageFile(file, "players");
      updatePlayerField(index, "logoUrl", logoUrl);
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const openTeamEditor = (team) => {
    setEditingTeamId(team.id);
    setEditTeamName(team.name || "");
    setEditTeamLogoUrl(team.logoUrl || null);
    setEditPlayerName("");
    setEditPlayerShirt("");
    setEditPlayerLogoUrl(null);
    setEditingPlayerId(null);
    setEditExistingPlayerName("");
    setEditExistingPlayerShirt("");
    if (editTeamLogoInputRef.current) editTeamLogoInputRef.current.value = "";
    if (editPlayerLogoInputRef.current) editPlayerLogoInputRef.current.value = "";
  };

  const closeTeamEditor = () => {
    setEditingTeamId(null);
    setEditTeamName("");
    setEditTeamLogoUrl(null);
    setEditPlayerName("");
    setEditPlayerShirt("");
    setEditPlayerLogoUrl(null);
    setEditingPlayerId(null);
    setEditExistingPlayerName("");
    setEditExistingPlayerShirt("");
    if (editTeamLogoInputRef.current) editTeamLogoInputRef.current.value = "";
    if (editPlayerLogoInputRef.current) editPlayerLogoInputRef.current.value = "";
  };

  const handleEditTeamLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const folder = isSinglesCategory(getActiveCategory()) ? "players" : "clubs";
      setEditTeamLogoUrl(await processImageFile(file, folder));
    } catch (err) {
      alert(err.message);
      e.target.value = "";
    }
  };

  const handleEditPlayerLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setEditPlayerLogoUrl(await processImageFile(file, "players"));
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
      const logoUrl = await processImageFile(file, "players");
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

  const startEditPlayer = (player) => {
    setEditingPlayerId(player.id);
    setEditExistingPlayerName(player.name || "");
    setEditExistingPlayerShirt(
      player.shirtNumber === 0 || player.shirtNumber
        ? String(player.shirtNumber)
        : ""
    );
  };

  const cancelEditPlayer = () => {
    setEditingPlayerId(null);
    setEditExistingPlayerName("");
    setEditExistingPlayerShirt("");
  };

  const handleSavePlayer = async (teamId, playerId) => {
    const trimmed = editExistingPlayerName.trim();
    if (!trimmed) {
      alert("Player name is required");
      return;
    }
    try {
      setSavingTeamEdit(true);
      const res = await fetch(
        `/api/tournaments/${id}/teams/${teamId}/players/${playerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: trimmed,
            shirtNumber: parseInt(editExistingPlayerShirt, 10) || 0,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update player");
      }
      cancelEditPlayer();
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  const handleDeletePlayer = async (teamId, player) => {
    const ok = window.confirm(
      `Remove "${player.name}" (#${player.shirtNumber}) from this club?`
    );
    if (!ok) return;

    try {
      setSavingTeamEdit(true);
      const res = await fetch(
        `/api/tournaments/${id}/teams/${teamId}/players/${player.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete player");
      }
      if (editingPlayerId === player.id) cancelEditPlayer();
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  const handleSaveTeamLogo = async (team) => {
    try {
      setSavingTeamEdit(true);
      const res = await fetch(`/api/tournaments/${id}/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ logoUrl: editTeamLogoUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update photo");
      }
      await syncSinglesLinkedPlayer(team, { logoUrl: editTeamLogoUrl });
      await fetchTournamentDetails({ silent: true });
      alert(
        isSinglesCategory(getActiveCategory())
          ? "Player photo updated."
          : "Club logo updated — it will show on the public live board."
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  const handleSaveTeamName = async (team) => {
    const trimmed = editTeamName.trim();
    const cat = getActiveCategory();
    if (!trimmed) {
      alert(
        isSinglesCategory(cat)
          ? "Enter a player name"
          : isDoublesOrMixedCategory(cat)
            ? "Enter a pair name"
            : "Enter a club / team name"
      );
      return;
    }
    try {
      setSavingTeamEdit(true);
      const res = await fetch(`/api/tournaments/${id}/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update name");
      }
      await syncSinglesLinkedPlayer(team, { name: trimmed });
      await fetchTournamentDetails({ silent: true });
      alert(
        isSinglesCategory(cat)
          ? "Player name updated."
          : isDoublesOrMixedCategory(cat)
            ? "Pair name updated."
            : "Club name updated."
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingTeamEdit(false);
    }
  };

  const handleDeleteTeam = async (team) => {
    const cat = getActiveCategory();
    const label = entryLabel(cat).toLowerCase();
    const ok = window.confirm(
      `Delete "${team.name}"?\n\nThis removes the ${label}${
        isSinglesCategory(cat) ? "" : ", its players,"
      } and any matches that include this entry. This cannot be undone.`
    );
    if (!ok) return;

    try {
      setSavingTeamEdit(true);
      const res = await fetch(`/api/tournaments/${id}/teams/${team.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete ${label}`);
      }
      closeTeamEditor();
      await fetchTournamentDetails({ silent: true });
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

  // Multi-format schedule generator (RR / League / Knockout / Swiss R1)
  const generateAutoSchedule = async () => {
    const cat = getActiveCategory();
    if (!cat) {
      alert("Select a category first.");
      return;
    }
    const realTeams = cat.teams
      ? cat.teams.filter((t) => !isPlaceholderTeam(t.name))
      : [];
    if (realTeams.length < 2) {
      alert("You need at least 2 teams to generate a schedule.");
      return;
    }

    if (cat.rounds.length > 0) {
      if (
        !window.confirm(
          "Generating a new schedule will delete all existing matches and live scores for this category. Proceed?"
        )
      ) {
        return;
      }
    }

    try {
      setSavingSchedule(true);
      const format = normalizeScheduleFormat(scheduleFormat);
      const rounds = generateScheduleRounds(format, realTeams);

      const res = await fetch(`/api/tournaments/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rounds,
          categoryId: cat.id,
          format,
          mode: "replace",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save schedule");
      await fetchTournamentDetails({ silent: true });
      setActiveTab("dashboard");
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const generateNextSwissRound = async () => {
    const cat = getActiveCategory();
    if (!cat) return;
    const realTeams = (cat.teams || []).filter((t) => !isPlaceholderTeam(t.name));
    const rounds = [...(cat.rounds || [])].sort((a, b) => a.number - b.number);
    if (rounds.length === 0) {
      alert("Generate Swiss Round 1 first.");
      return;
    }
    const latest = rounds[rounds.length - 1];
    const latestDone =
      latest.matches.length > 0 &&
      latest.matches.every((m) => m.status === "COMPLETED");
    if (!latestDone) {
      alert("Complete all matches in the current Swiss round before generating the next.");
      return;
    }

    const allMatches = rounds.flatMap((r) => r.matches || []);
    const completed = allMatches.filter((m) => m.status === "COMPLETED");
    const nextNumber = latest.number + 1;
    const suggested = suggestedSwissRounds(realTeams.length);
    if (nextNumber > suggested) {
      if (
        !window.confirm(
          `Suggested Swiss depth is ${suggested} rounds for ${realTeams.length} clubs. Generate round ${nextNumber} anyway?`
        )
      ) {
        return;
      }
    }

    try {
      setSavingSchedule(true);
      const round = generateSwissRound(realTeams, completed, nextNumber, allMatches);
      if (!round.matches.length) {
        throw new Error("Could not pair any matches for the next Swiss round.");
      }
      const res = await fetch(`/api/tournaments/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rounds: [round],
          categoryId: cat.id,
          format: "SWISS",
          mode: "append",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to append Swiss round");
      await fetchTournamentDetails({ silent: true });
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Add Match to Manual Round Form
  const addManualMatch = (rIndex) => {
    const updated = [...manualRounds];
    updated[rIndex].matches.push({ teamAId: "", teamBId: "", scheduledAt: "" });
    setManualRounds(updated);
  };

  // Remove Match from Manual Round Form
  const removeManualMatch = (rIndex, mIndex) => {
    const updated = [...manualRounds];
    updated[rIndex].matches = updated[rIndex].matches.filter((_, i) => i !== mIndex);
    setManualRounds(updated);
  };

  // TBD slots are encoded as "name:<placeholder>" in the manual dropdowns.
  const decodeManualSide = (value) =>
    String(value || "").startsWith("name:")
      ? { name: String(value).slice(5) }
      : { id: value };

  /** Map renamed placeholders ("TBD (1st Place)") back to canonical names the resolver understands. */
  const canonicalPlaceholderName = (name) => {
    const w = String(name || "").match(/winner\s*r(\d+)\s*m(\d+)/i);
    if (w) return `Winner R${w[1]}M${w[2]}`;
    const n = String(name || "").toLowerCase();
    if (n.includes("1st")) return "1st placed team";
    if (n.includes("2nd")) return "2nd placed team";
    if (n.includes("3rd")) return "3rd placed team";
    if (n.includes("4th")) return "4th placed team";
    return String(name || "TBD");
  };

  /** Placeholder choices for a manual round: seeds + winners of earlier rounds. */
  const manualPlaceholderOptions = (rIndex) => {
    const opts = [
      { value: "name:1st placed team", label: "TBD — 1st placed team" },
      { value: "name:2nd placed team", label: "TBD — 2nd placed team" },
      { value: "name:3rd placed team", label: "TBD — 3rd placed team" },
      { value: "name:4th placed team", label: "TBD — 4th placed team" },
    ];
    for (let r = 0; r < rIndex; r++) {
      (manualRounds[r]?.matches || []).forEach((_, mi) => {
        opts.push({
          value: `name:Winner R${r + 1}M${mi + 1}`,
          label: `TBD — Winner of Round ${r + 1} Match ${mi + 1}`,
        });
      });
    }
    return opts;
  };

  // Load current schedule into manual rounds
  const loadExistingIntoManual = () => {
    const cat = getActiveCategory();
    if (!cat || !cat.rounds || cat.rounds.length === 0) {
      alert("No current schedule to load for this category.");
      return;
    }
    const teamById = Object.fromEntries((cat.teams || []).map((t) => [t.id, t]));
    const sideValue = (teamId) => {
      const slot = teamById[teamId];
      if (slot && isPlaceholderTeam(slot._sourceName || slot.name)) {
        return `name:${canonicalPlaceholderName(slot._sourceName || slot.name)}`;
      }
      return teamId;
    };
    const mapped = cat.rounds.map(r => ({
      number: r.number,
      name: r.name || `Round ${r.number}`,
      matches: r.matches.map(m => ({
        teamAId: sideValue(m.teamAId),
        teamBId: sideValue(m.teamBId),
        scheduledAt: toDateTimeInputValue(m.scheduledAt),
      }))
    }));
    setManualRounds(mapped);
  };

  // Add Round to Manual Form
  const addManualRound = () => {
    const n = manualRounds.length + 1;
    setManualRounds([...manualRounds, { number: n, name: `Round ${n}`, matches: [{ teamAId: "", teamBId: "", scheduledAt: "" }] }]);
  };

  // Remove Round from Manual Form
  const removeManualRound = (index) => {
    setManualRounds(manualRounds.filter((_, i) => i !== index).map((r, idx) => ({
      ...r,
      number: idx + 1,
      name: r.name?.trim() ? r.name : `Round ${idx + 1}`,
    })));
  };

  const updateManualRoundName = (rIndex, name) => {
    const updated = [...manualRounds];
    updated[rIndex] = { ...updated[rIndex], name };
    setManualRounds(updated);
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
            throw new Error("All matches must have both sides selected (club or TBD).");
          }
          if (m.teamAId === m.teamBId) {
            throw new Error("A match cannot have the same club or TBD slot on both sides.");
          }
        }
      }

      // datetime-local values are in the admin's timezone — send as ISO.
      // TBD selections go as teamAName/teamBName so the API creates placeholder slots.
      const roundsPayload = manualRounds.map((r) => ({
        number: r.number,
        name: r.name,
        matches: r.matches.map((m) => {
          const a = decodeManualSide(m.teamAId);
          const b = decodeManualSide(m.teamBId);
          return {
            ...(a.id ? { teamAId: a.id } : { teamAName: a.name }),
            ...(b.id ? { teamBId: b.id } : { teamBName: b.name }),
            scheduledAt: m.scheduledAt
              ? new Date(m.scheduledAt).toISOString()
              : null,
          };
        }),
      }));

      const res = await fetch(`/api/tournaments/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rounds: roundsPayload, categoryId: cat.id }),
      });

      if (!res.ok) throw new Error("Failed to save schedule");
      await fetchTournamentDetails({ silent: true });
      setManualRounds([{ number: 1, name: "Round 1", matches: [{ teamAId: "", teamBId: "", scheduledAt: "" }] }]);
      setActiveTab("dashboard");
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Standings Calculations — group stage only (TBD / knockout excluded)
  const calculateStandings = () => {
    const cat = getActiveCategory();
    if (!cat) return [];
    return buildFootballStandings(cat).map(({ teamObj: _t, ...row }) => row);
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
    if (isCricketSport(getActiveCategory()?.sport)) {
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
    if (isSetBasedSport(getActiveCategory()?.sport)) {
      const cat = getActiveCategory();
      const headers = [
        "Position",
        isSinglesCategory(cat) ? "Player" : isDoublesOrMixedCategory(cat) ? "Pair" : "Team",
        "Played",
        "Won",
        "Lost",
        "Sets For",
        "Sets Against",
        "Set Diff",
        "Points",
      ];
      const rows = calculateSetBasedStandings(cat).map((t, idx) => [
        idx + 1,
        t.name,
        t.played,
        t.won,
        t.lost,
        t.setsFor,
        t.setsAgainst,
        t.setDiff,
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
    if (isCricketSport(getActiveCategory()?.sport)) {
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
  const isCricket = isCricketSport(activeCategory?.sport);
  const isSetBased = isSetBasedSport(activeCategory?.sport);
  const isSingles = isSinglesCategory(activeCategory);
  const isPairEntry = isDoublesOrMixedCategory(activeCategory);
  const entriesLabel = entryLabelPlural(activeCategory);
  const oneEntryLabel = entryLabel(activeCategory);
  const footballStandings = calculateStandings();
  const cricketStandings = calculateCricketStandings(activeCategory).filter(
    (t) => !isPlaceholderTeam(t.name)
  );
  const setBasedStandings = isSetBased
    ? calculateSetBasedStandings(activeCategory)
    : [];
  const standings = isCricket
    ? cricketStandings
    : isSetBased
      ? setBasedStandings
      : footballStandings;
  const topScorers = isSetBased ? [] : calculateTopScorers();
  const cricketLeaders = isCricket
    ? calculateCricketLeaders(activeCategory)
    : { runScorers: [], wicketTakers: [], bestFielders: [] };
  const liveMatches = categoryRounds.flatMap(r => r.matches).filter(m => m.status === "LIVE");

  return (
    <div className="flex flex-col min-h-screen bg-[#FAF6EE] text-[#0a331f] font-sans selection:bg-mustard-gold selection:text-deep-forest overflow-x-hidden relative safe-pad-bottom">
      
      {/* Unified upper section: pitch stripes for header + categories + tabs */}
      <div className="pitch-stripes border-b-4 border-mustard-gold/80 shadow-sm relative overflow-hidden safe-pad-top">
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
                  <span>FORCE PULSE</span>
                  {activeCategory ? (
                    <>
                      <span>•</span>
                      <span>{categoryDisplayName(activeCategory)}</span>
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
                      setManualRounds([{ number: 1, name: "Round 1", matches: [{ teamAId: "", teamBId: "" }] }]);
                    }}
                    className={`px-3.5 py-2.5 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer min-h-[44px] ${
                      isActive
                        ? "bg-mustard-gold text-deep-forest border-mustard-gold shadow-sm"
                        : "bg-[#093c24]/70 text-white/85 border-white/15 hover:bg-[#093c24] hover:text-white hover:border-white/30"
                    }`}
                  >
                    {categoryDisplayName(cat)}
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
              {
                id: "teams",
                label: isSingles
                  ? "Players"
                  : isPairEntry
                    ? "Pairs"
                    : "Teams & Squads",
                short: isSingles ? "Players" : isPairEntry ? "Pairs" : "Teams",
                icon: Users,
              },
              { id: "schedule", label: "Schedule Builder", short: "Schedule", icon: Calendar },
              { id: "standings", label: "Standings Table", short: "Standings", icon: Trophy },
              ...(!isSetBased
                ? [
                    {
                      id: "scorers",
                      label: isCricket ? "Leaders Hub" : "Scorers Hub",
                      short: isCricket ? "Leaders" : "Scorers",
                      icon: Award,
                    },
                  ]
                : []),
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
                      <span className="text-xl font-display text-deep-forest uppercase tracking-wider">{getRoundName(round.number, categoryRounds.length, activeCategory?.scheduleFormat, round.name)}</span>
                      <span className="text-[9px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded-full px-3 py-1 uppercase font-bold shadow-sm">
                        {round.matches.length} Matches
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                      {round.matches.map((match) => {
                        const isLive = match.status === "LIVE";
                        const isCompleted = match.status === "COMPLETED";
                        const isScheduled = match.status === "SCHEDULED";
                        const clockLabel = !isCricket
                          ? matchCardClockLabel(match, boardClockNow, activeCategory, id)
                          : null;
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
                            <div className="flex justify-between items-center mb-6 gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded border tracking-wider ${
                                  isLive 
                                    ? "bg-red-50 border-red-200 text-red-700 animate-pulse" 
                                    : isCompleted
                                    ? "bg-slate-100 border-slate-200 text-slate-500"
                                    : "bg-slate-50 border-slate-200/60 text-slate-400"
                                }`}>
                                  {match.status}
                                </span>
                                {clockLabel && (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold tabular-nums px-2 py-1 rounded-lg border ${
                                      isLive
                                        ? "bg-[#0d472c] text-mustard-gold border-[#0d472c]"
                                        : isCompleted
                                          ? "bg-[#0d472c]/10 text-deep-forest border-mustard-gold/40"
                                          : "bg-slate-50 text-slate-500 border-slate-200"
                                    }`}
                                    title={isCompleted ? "Full time" : "Match clock"}
                                  >
                                    <Clock className="w-3 h-3 shrink-0 opacity-70" />
                                    {clockLabel}
                                    {isCompleted ? (
                                      <span className="text-[8px] uppercase tracking-wider opacity-60 font-bold">
                                        FT
                                      </span>
                                    ) : null}
                                  </span>
                                )}
                                {isScheduled && match.scheduledAt && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-lg border bg-mustard-gold/15 text-deep-forest border-mustard-gold/40"
                                    title="Planned start time"
                                  >
                                    <Clock className="w-3 h-3 shrink-0 opacity-70" />
                                    {formatScheduledAt(match.scheduledAt)}
                                  </span>
                                )}
                              </div>
                              {isLive && (
                                <div className="flex items-center gap-1.5 text-[9px] text-red-650 font-mono font-bold animate-pulse shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                                  SCORING OPENED
                                </div>
                              )}
                            </div>

                            {/* Score Display Grid */}
                            <div className="grid grid-cols-3 items-center gap-1.5 sm:gap-3 text-center mb-6">
                              {/* Team A — left */}
                              <div className="space-y-2 w-full min-w-0 max-w-[88px] sm:max-w-[100px] md:max-w-[140px] justify-self-center flex flex-col items-center">
                                {resolveTeamLogo(match.teamA, activeCategory) ? (
                                  <img
                                    src={resolveTeamLogo(match.teamA, activeCategory)}
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
                                {isCricket && (
                                  <span className="text-sm sm:text-lg font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 py-1.5 rounded-xl shadow tabular-nums">
                                    {match.scoreA}/{match.wicketsA ?? 0}
                                  </span>
                                )}
                              </div>

                              {/* Center scores — set sports show live rally points when LIVE */}
                              {isCricket ? (
                                <div className="flex flex-col items-center justify-center gap-1 text-center">
                                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                                    vs
                                  </span>
                                </div>
                              ) : isSetBased ? (
                                (() => {
                                  const cur =
                                    (match.matchSets || []).find(
                                      (s) => s.setNumber === (match.currentSet || 1)
                                    ) || { scoreA: 0, scoreB: 0 };
                                  const live = match.status === "LIVE";
                                  const a = live ? cur.scoreA : match.scoreA;
                                  const b = live ? cur.scoreB : match.scoreB;
                                  const unit =
                                    String(activeCategory?.sport || "").toUpperCase() ===
                                    "BADMINTON"
                                      ? "Games"
                                      : "Sets";
                                  return (
                                    <div className="flex flex-col items-center justify-center gap-1">
                                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                                        <span className="text-xl sm:text-2xl font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl shadow min-w-[36px] sm:min-w-[44px]">
                                          {a}
                                        </span>
                                        <span className="text-slate-400 font-bold font-mono text-sm sm:text-lg">:</span>
                                        <span className="text-xl sm:text-2xl font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl shadow min-w-[36px] sm:min-w-[44px]">
                                          {b}
                                        </span>
                                      </div>
                                      {live && (
                                        <span className="text-[9px] font-mono text-deep-forest/45">
                                          {unit} {match.scoreA}–{match.scoreB}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()
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

                              {/* Team B — right */}
                              <div className="space-y-2 w-full min-w-0 max-w-[88px] sm:max-w-[100px] md:max-w-[140px] justify-self-center flex flex-col items-center">
                                {resolveTeamLogo(match.teamB, activeCategory) ? (
                                  <img
                                    src={resolveTeamLogo(match.teamB, activeCategory)}
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
                                {isCricket && (
                                  <span className="text-sm sm:text-lg font-mono font-bold text-white bg-[#0a331f] border border-black px-2.5 py-1.5 rounded-xl shadow tabular-nums">
                                    {match.scoreB}/{match.wicketsB ?? 0}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Pick clubs from the tournament's real teams */}
                            {isPicking && (
                              <div className="mb-4 space-y-3 border border-dashed border-mustard-gold/70 rounded-xl bg-cream-bg/60 p-3">
                                <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-deep-forest/60">
                                  Pick {entriesLabel.toLowerCase()} ({realClubs.length} available)
                                </p>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <select
                                    value={pickTeamAId}
                                    onChange={(e) => setPickTeamAId(e.target.value)}
                                    className="flex-1 bg-white border border-slate-200 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none cursor-pointer"
                                  >
                                    <option value="">
                                      {isSingles
                                        ? "-- Player A --"
                                        : isPairEntry
                                          ? "-- Pair A --"
                                          : "-- Home club --"}
                                    </option>
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
                                    <option value="">
                                      {isSingles
                                        ? "-- Player B --"
                                        : isPairEntry
                                          ? "-- Pair B --"
                                          : "-- Away club --"}
                                    </option>
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
                <div className="flex items-center gap-2 mb-2 border-b border-slate-100 pb-3">
                  <Users className="w-5 h-5 text-mustard-gold" />
                  <h3 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">
                    {isSingles ? "Register Player" : isPairEntry ? "Register Pair" : "Register Club"}
                  </h3>
                </div>
                <p className="text-[10px] font-mono text-deep-forest/50 mb-6 leading-relaxed">
                  {isSingles
                    ? "Add player name and optional photo only — no team roster."
                    : isPairEntry
                      ? "Add a pair display name, then both players with optional photos."
                      : "Add club name, optional logo, then players with jersey numbers and photos."}{" "}
                  Category:{" "}
                  <span className="font-bold text-deep-forest">
                    {activeCategory ? categoryDisplayName(activeCategory) : "—"}
                  </span>
                </p>

                <form onSubmit={handleAddTeam} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                      {isSingles ? "Player Name" : isPairEntry ? "Pair Name" : "Club / Team Name"}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        isSingles
                          ? "e.g. Andre Silva"
                          : isPairEntry
                            ? "e.g. Mike Torres / Dan Foster"
                            : "e.g. Spring Leaf United"
                      }
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      className="w-full bg-[#FAF6EE]/50 border border-slate-200 focus:bg-white focus:border-mustard-gold focus:ring-1 focus:ring-mustard-gold rounded-xl px-4 py-2.5 text-sm text-deep-forest placeholder-slate-400 outline-none transition-all shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest mb-2 font-bold">
                      {isSingles ? "Player Photo" : isPairEntry ? "Pair Photo (optional)" : "Upload Club Logo"}
                    </label>
                    <div className="flex items-center gap-3">
                      {newTeamLogoUrl ? (
                        <img
                          src={newTeamLogoUrl}
                          alt="Preview"
                          className="w-14 h-14 rounded-full object-cover border-2 border-mustard-gold shadow-sm"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-cream-bg border border-dashed border-slate-300 flex items-center justify-center">
                          {isSingles ? (
                            <ImagePlus className="w-5 h-5 text-slate-300" />
                          ) : (
                            <Trophy className="w-5 h-5 text-slate-300" />
                          )}
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
                            {isSingles ? "Remove photo" : "Remove logo"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isSingles && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <label className="block text-[10px] font-mono text-deep-forest/60 uppercase tracking-widest font-bold">
                        {isPairEntry ? "Pair Players (2)" : "Add Players"}
                      </label>
                      {!isPairEntry && (
                        <button
                          type="button"
                          onClick={addPlayerRow}
                          className="text-mustard-gold hover:text-mustard-gold-hover text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Add Player
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-deep-forest/45">
                      {isPairEntry
                        ? "Enter both partners · tap the circle for a photo"
                        : "Tap the circle for a player photo · enter name & jersey #"}
                    </p>

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
                              placeholder={isPairEntry ? `Player ${idx + 1}` : "Player Name"}
                              value={player.name}
                              onChange={(e) => updatePlayerField(idx, "name", e.target.value)}
                              className="flex-1 bg-white/70 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none transition-all"
                            />
                            {!isPairEntry && (
                              <input
                                type="number"
                                placeholder="Jersey"
                                value={player.shirtNumber}
                                onChange={(e) => updatePlayerField(idx, "shirtNumber", e.target.value)}
                                className="w-20 bg-white/70 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-2 py-2 text-xs text-center text-deep-forest outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            )}
                            {!isPairEntry && newPlayers.length > 1 && (
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
                  )}

                  <button
                    type="submit"
                    disabled={addingTeam}
                    className="w-full bg-mustard-gold hover:bg-mustard-gold-hover text-deep-forest font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {addingTeam ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 stroke-[3px]" />
                        {isSingles
                          ? "Register Player"
                          : isPairEntry
                            ? "Register Pair"
                            : "Confirm Registration"}
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Teams Directory List */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-deep-forest/60 uppercase tracking-widest font-mono">
                  Registered {entriesLabel}
                </h3>
                <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded px-2.5 py-0.5 font-bold shadow-sm">
                  Total {entriesLabel}: {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length}
                </span>
              </div>

              {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-neutral-400 gap-2 shadow-sm">
                  <Users className="w-10 h-10 text-slate-300" />
                  <span className="text-xs font-mono">
                    {isSingles
                      ? "No players yet"
                      : isPairEntry
                        ? "No pairs yet"
                        : "No Clubs Drafted Yet"}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).map((team) => {
                    const isEditing = editingTeamId === team.id;
                    const avatarUrl = resolveTeamLogo(team, activeCategory);
                    const singlesPlayer = isSingles ? team.players?.[0] : null;
                    const displayName = singlesPlayer?.name || team.name;
                    return (
                    <div 
                      key={team.id}
                      className={`bg-white border-2 border-dashed rounded-2xl p-5 sm:p-6 shadow-sm transition-all ${
                        isEditing
                          ? "border-solid border-mustard-gold ring-2 ring-mustard-gold/30"
                          : "border-mustard-gold hover:border-solid hover:shadow-md"
                      }`}
                    >
                      <div className={`flex items-start justify-between gap-3 ${isSingles && !isEditing ? "" : "border-b border-slate-100 pb-3 mb-4"}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              className="w-12 h-12 rounded-full object-cover border-2 border-mustard-gold/60 shadow-sm shrink-0"
                            />
                          ) : (
                            <div 
                              style={{ background: getTeamGradient(displayName) }}
                              className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase select-none border border-white shadow-sm shrink-0"
                            >
                              {displayName.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-deep-forest uppercase text-sm tracking-wide truncate">{displayName}</h4>
                            {!isSingles && (
                              <span className="text-[9px] font-mono text-deep-forest/60 uppercase font-bold">
                                {team.players?.length || 0}{" "}
                                {isPairEntry ? "Players" : "Registered Members"}
                              </span>
                            )}
                            {isSingles && (
                              <span className="text-[9px] font-mono text-deep-forest/60 uppercase font-bold">
                                {avatarUrl ? "Player photo on file" : "Add a photo via Edit"}
                              </span>
                            )}
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
                          {/* Edit name */}
                          <div>
                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55 mb-2">
                              {isSingles
                                ? "Player name"
                                : isPairEntry
                                  ? "Pair name"
                                  : "Club / team name"}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={editTeamName}
                                onChange={(e) => setEditTeamName(e.target.value)}
                                placeholder={
                                  isSingles
                                    ? "Player name"
                                    : isPairEntry
                                      ? "Pair name"
                                      : "Club name"
                                }
                                className="flex-1 bg-[#FAF6EE]/50 border border-slate-200 focus:bg-white focus:border-mustard-gold rounded-xl px-3 py-2.5 text-xs outline-none"
                              />
                              <button
                                type="button"
                                disabled={
                                  savingTeamEdit ||
                                  editTeamName.trim() === "" ||
                                  editTeamName.trim() === team.name
                                }
                                onClick={() => handleSaveTeamName(team)}
                                className="px-3 py-2.5 bg-[#0d472c] text-white rounded-xl text-[9px] font-mono font-bold uppercase cursor-pointer disabled:opacity-40 min-h-[40px]"
                              >
                                Save name
                              </button>
                            </div>
                          </div>

                          {/* Upload / change photo */}
                          <div>
                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-deep-forest/55 mb-2">
                              {isSingles ? "Player photo" : isPairEntry ? "Pair photo" : "Club photo / logo"}
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
                                    onClick={() => handleSaveTeamLogo(team)}
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

                          {/* Add player — not for singles */}
                          {!isSingles && (
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
                          )}

                          {/* Delete */}
                          <div className="pt-2 border-t border-dashed border-red-200">
                            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-red-600/70 mb-2">
                              Danger zone
                            </p>
                            <button
                              type="button"
                              disabled={savingTeamEdit}
                              onClick={() => handleDeleteTeam(team)}
                              className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-[9px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50 min-h-[40px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete {oneEntryLabel.toLowerCase()}
                            </button>
                            <p className="mt-1.5 text-[10px] font-mono text-deep-forest/45 leading-snug">
                              {isSingles
                                ? "Removes this player and any matches that include them."
                                : isPairEntry
                                  ? "Removes this pair, its players, and any matches that include it."
                                  : "Removes this club, its players, and any matches that include it."}
                            </p>
                          </div>
                        </div>
                      )}

                      {!isSingles && (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {team.players && team.players.length > 0 ? (
                          team.players.map((p) => {
                            const isEditingPlayer = isEditing && editingPlayerId === p.id;
                            return (
                            <div key={p.id} className="flex flex-col gap-2 text-xs font-mono text-[#3f6b55] bg-[#fcf7ed] border border-transparent hover:border-slate-200 rounded-lg px-3 py-2 transition-all">
                              <div className="flex justify-between items-center gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
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
                                {isEditingPlayer ? (
                                  <div className="flex flex-1 items-center gap-1.5 min-w-0">
                                    <input
                                      type="text"
                                      value={editExistingPlayerName}
                                      onChange={(e) => setEditExistingPlayerName(e.target.value)}
                                      className="flex-1 min-w-0 bg-white border border-mustard-gold/50 rounded-lg px-2 py-1.5 text-xs font-sans font-bold outline-none"
                                      placeholder="Player name"
                                    />
                                    <input
                                      type="number"
                                      value={editExistingPlayerShirt}
                                      onChange={(e) => setEditExistingPlayerShirt(e.target.value)}
                                      className="w-14 bg-white border border-mustard-gold/50 rounded-lg px-1.5 py-1.5 text-xs text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="No."
                                    />
                                  </div>
                                ) : (
                                  <span className="truncate font-sans font-bold">{p.name}</span>
                                )}
                              </div>
                              {isEditingPlayer ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={savingTeamEdit}
                                    onClick={() => handleSavePlayer(team.id, p.id)}
                                    className="px-2 py-1.5 bg-[#0d472c] text-white rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingTeamEdit}
                                    onClick={cancelEditPlayer}
                                    className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="flex items-center gap-1 text-[9px] font-bold text-deep-forest bg-mustard-gold/15 border border-mustard-gold/30 rounded px-1.5 py-0.5">
                                    <span>No.</span>
                                    <span>{p.shirtNumber}</span>
                                  </div>
                                  {isEditing && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={savingTeamEdit}
                                        onClick={() => startEditPlayer(p)}
                                        title="Edit player"
                                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-deep-forest hover:bg-mustard-gold/20 cursor-pointer disabled:opacity-50"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={savingTeamEdit}
                                        onClick={() => handleDeletePlayer(team.id, p)}
                                        title="Delete player"
                                        className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer disabled:opacity-50"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              </div>
                            </div>
                            );
                          })
                        ) : (
                          <div className="text-center py-6 text-xs font-mono text-neutral-400">
                            Roster Sheet Empty — tap Edit to add players
                          </div>
                        )}
                      </div>
                      )}
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
                <span className="hidden sm:inline">Format Generator</span>
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

            {/* AUTO MULTI-FORMAT BUILDER */}
            {schedulerMode === "auto" && (
              <div className="max-w-2xl bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 space-y-6 shadow-sm relative overflow-hidden">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-mustard-gold">
                    <Sparkles className="w-4 h-4 text-mustard-gold" />
                    <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                      Schedule Format Generator
                    </h3>
                  </div>
                  <p className="text-xs text-deep-forest/70 leading-relaxed">
                    {scheduleFormatHelp(scheduleFormat)}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SCHEDULE_FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setScheduleFormat(fmt)}
                      className={`px-3 py-2.5 rounded-xl border-2 font-mono text-[10px] uppercase tracking-wider min-h-[44px] cursor-pointer transition-all ${
                        scheduleFormat === fmt
                          ? "bg-mustard-gold text-deep-forest border-mustard-gold font-bold"
                          : "bg-cream-bg text-deep-forest/70 border-slate-200 hover:border-mustard-gold/50"
                      }`}
                    >
                      {scheduleFormatLabel(fmt)}
                    </button>
                  ))}
                </div>

                {activeCategory?.scheduleFormat && (
                  <p className="text-[10px] font-mono text-deep-forest/50">
                    Current category format:{" "}
                    <span className="font-bold text-deep-forest">
                      {scheduleFormatLabel(activeCategory.scheduleFormat)}
                    </span>
                  </p>
                )}

                <div className="border border-slate-200 rounded-xl p-4 bg-cream-bg space-y-3 shadow-inner">
                  <div className="flex justify-between items-center text-xs font-mono border-b border-slate-200 pb-2">
                    <span className="text-deep-forest/50">Total Registered Teams</span>
                    <span className="text-deep-forest font-bold">{categoryTeams.filter(t => !isPlaceholderTeam(t.name)).length} Clubs</span>
                  </div>
                  {scheduleFormat === "SWISS" && (
                    <div className="flex justify-between items-center text-xs font-mono border-b border-slate-200 pb-2">
                      <span className="text-deep-forest/50">Suggested Swiss rounds</span>
                      <span className="text-deep-forest font-bold">
                        {suggestedSwissRounds(
                          categoryTeams.filter((t) => !isPlaceholderTeam(t.name)).length
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {categoryTeams.filter(t => !isPlaceholderTeam(t.name)).map(team => (
                      <span key={team.id} className="text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-deep-forest flex items-center gap-2 shadow-sm">
                        {resolveTeamLogo(team, activeCategory) ? (
                          <img
                            src={resolveTeamLogo(team, activeCategory)}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0 bg-white"
                          />
                        ) : (
                          <span
                            style={{ background: getTeamGradient(team.name) }}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white font-bold uppercase shrink-0"
                          >
                            {team.name.slice(0, 2)}
                          </span>
                        )}
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
                  <div className="space-y-3">
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
                          {scheduleFormat === "SWISS"
                            ? "Generate & Publish Swiss Round 1"
                            : `Generate & Publish ${scheduleFormatLabel(scheduleFormat)}`}
                        </>
                      )}
                    </button>

                    {normalizeScheduleFormat(activeCategory?.scheduleFormat) === "SWISS" &&
                      categoryRounds.length > 0 &&
                      (() => {
                        const sorted = [...categoryRounds].sort(
                          (a, b) => a.number - b.number
                        );
                        const last = sorted[sorted.length - 1];
                        const ready =
                          last?.matches?.length > 0 &&
                          last.matches.every((m) => m.status === "COMPLETED");
                        return (
                          <button
                            type="button"
                            onClick={generateNextSwissRound}
                            disabled={savingSchedule || !ready}
                            className="w-full bg-[#0d472c] hover:bg-[#093c24] text-white font-bold uppercase tracking-wider py-3.5 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                          >
                            {ready
                              ? `Generate Swiss Round ${(last?.number || 0) + 1}`
                              : "Complete current Swiss round to unlock next"}
                          </button>
                        );
                      })()}
                  </div>
                )}
              </div>
            )}

            {/* MANUAL BUILDER */}
            {schedulerMode === "manual" && (
              <form onSubmit={saveManualSchedule} className="space-y-6 max-w-3xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <div>
                    <h3 className="text-xs font-bold text-deep-forest/60 uppercase tracking-widest font-mono">Manual Round Planner</h3>
                    <p className="text-[10px] font-mono text-deep-forest/45 mt-1">
                      Pick clubs — or TBD slots (1st–4th placed, winner of an earlier match) for semis and finals. TBD slots fill in automatically from results.
                    </p>
                  </div>
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
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4 gap-3">
                        <input
                          type="text"
                          value={round.name ?? `Round ${round.number}`}
                          onChange={(e) => updateManualRoundName(rIndex, e.target.value)}
                          placeholder={`Round ${round.number}`}
                          className="font-bold text-deep-forest font-mono text-xs uppercase tracking-wider bg-transparent border border-transparent hover:border-slate-200 focus:border-mustard-gold focus:bg-cream-bg/40 rounded-lg px-2 py-1.5 outline-none min-w-0 flex-1 max-w-xs"
                        />
                        {manualRounds.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeManualRound(rIndex)}
                            className="text-red-500 hover:text-red-650 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer shrink-0"
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
                                <option value="">
                                  {isSingles
                                    ? "-- Choose player --"
                                    : isPairEntry
                                      ? "-- Choose pair --"
                                      : "-- Choose Home Club --"}
                                </option>
                                <optgroup label="Clubs">
                                  {categoryTeams
                                    .filter((t) => !isPlaceholderTeam(t.name))
                                    .map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="TBD / Placeholders">
                                  {manualPlaceholderOptions(rIndex).map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                  ))}
                                </optgroup>
                              </select>

                              <span className="text-slate-400 font-mono text-xs font-bold my-1 sm:my-0">VS</span>

                              {/* Team B Dropdown */}
                              <select
                                required
                                value={match.teamBId}
                                onChange={(e) => updateManualMatchField(rIndex, mIndex, "teamBId", e.target.value)}
                                className="w-full sm:flex-1 bg-white border border-slate-200 hover:border-slate-350 focus:border-mustard-gold rounded-xl px-3 py-2 text-xs text-deep-forest outline-none transition-all cursor-pointer shadow-sm"
                              >
                                <option value="">
                                  {isSingles
                                    ? "-- Choose player --"
                                    : isPairEntry
                                      ? "-- Choose pair --"
                                      : "-- Choose Away Club --"}
                                </option>
                                <optgroup label="Clubs">
                                  {categoryTeams
                                    .filter((t) => !isPlaceholderTeam(t.name))
                                    .map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="TBD / Placeholders">
                                  {manualPlaceholderOptions(rIndex).map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>

                            {/* Optional planned start time — e.g. Final at 5:00 PM */}
                            <label className="flex items-center gap-1.5 w-full md:w-auto shrink-0">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <input
                                type="datetime-local"
                                value={match.scheduledAt || ""}
                                onChange={(e) =>
                                  updateManualMatchField(rIndex, mIndex, "scheduledAt", e.target.value)
                                }
                                title="Match start time (optional)"
                                className="w-full md:w-auto bg-white border border-slate-200 hover:border-slate-350 focus:border-mustard-gold rounded-xl px-2.5 py-2 text-[11px] font-mono text-deep-forest outline-none transition-all shadow-sm"
                              />
                            </label>

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
              <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono">
                {isSetBased ? "Standings" : "League Standings"}
              </h3>
              <span className="text-[10px] font-mono text-deep-forest bg-white border border-dashed border-mustard-gold rounded px-3 py-1.5 font-bold w-fit">
                {isCricket
                  ? "W=2 PTS, T=1 PTS, L=0 PTS"
                  : isSetBased
                    ? "W=3 PTS · Best of sets · No draws"
                    : "W=3 PTS, D=1 PTS, L=0 PTS"}
              </span>
            </div>

            {standings.length === 0 ? (
              <div className="text-center py-20 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-slate-400 font-mono text-xs shadow-sm">
                No standings data available. Add {entriesLabel.toLowerCase()} and generate schedules.
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
                          <th className="py-3 px-4 font-sans text-sm tracking-wide">
                            {isSingles ? "Player" : isPairEntry ? "Pair" : "Team"}
                          </th>
                          <th className="py-3 px-3 text-center w-14">P</th>
                          <th className="py-3 px-3 text-center w-14">W</th>
                          {!isSetBased && (
                            <th className="py-3 px-3 text-center w-14">{isCricket ? "T" : "D"}</th>
                          )}
                          <th className="py-3 px-3 text-center w-14">L</th>
                          {isCricket ? (
                            <th className="py-3 px-3 text-center w-14">RF</th>
                          ) : isSetBased ? (
                            <>
                              <th className="py-3 px-3 text-center w-14">SF</th>
                              <th className="py-3 px-3 text-center w-14">SA</th>
                              <th className="py-3 px-3 text-center w-14">SD</th>
                            </>
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
                                {resolveTeamLogo(t, activeCategory) ? (
                                  <img
                                    src={resolveTeamLogo(t, activeCategory)}
                                    alt=""
                                    className="w-7 h-7 rounded-full object-cover border border-white shadow-sm shrink-0 bg-white"
                                  />
                                ) : (
                                  <div
                                    style={{ background: getTeamGradient(t.name) }}
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] text-white font-bold uppercase select-none border border-white shadow-sm shrink-0"
                                  >
                                    {t.name.slice(0, 2)}
                                  </div>
                                )}
                                <span className="truncate max-w-[160px] md:max-w-xs uppercase tracking-wide">{t.name}</span>
                              </td>
                              <td className="py-3 px-3 text-center">{t.played}</td>
                              <td className="py-3 px-3 text-center">{t.won}</td>
                              {!isSetBased && (
                                <td className="py-3 px-3 text-center">{isCricket ? t.tied : t.drawn}</td>
                              )}
                              <td className="py-3 px-3 text-center">{t.lost}</td>
                              {isCricket ? (
                                <td className="py-3 px-3 text-center text-slate-500">{t.runsFor}</td>
                              ) : isSetBased ? (
                                <>
                                  <td className="py-3 px-3 text-center text-slate-500">{t.setsFor}</td>
                                  <td className="py-3 px-3 text-center text-slate-500">{t.setsAgainst}</td>
                                  <td
                                    className={`py-3 px-3 text-center font-bold ${
                                      t.setDiff > 0
                                        ? "text-emerald-700"
                                        : t.setDiff < 0
                                          ? "text-red-500"
                                          : "text-[#0a331f]/70"
                                    }`}
                                  >
                                    {t.setDiff > 0 ? `+${t.setDiff}` : t.setDiff}
                                  </td>
                                </>
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
                                {isCricket || isSetBased ? t.points : t.pts}
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
                      : isSetBased
                        ? "Win = 3 pts · Loss = 0 · SF/SA = sets for/against · SD = set difference"
                        : "Win = 3 pts · Draw = 1 pt · Loss = 0 pts"}
                  </div>
                </div>

                {/* Top Scorers inside Standings — football only */}
                {!isCricket && !isSetBased && topScorers.length > 0 && (
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
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono min-w-[420px]">
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
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono min-w-[420px]">
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
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold text-deep-forest/65 uppercase tracking-widest font-mono mb-4">
                Best fielders
              </h3>
              <p className="text-[10px] font-mono text-deep-forest/45 -mt-2 mb-4">
                Catches, run-outs & stumpings · plus match Best Fielder awards
              </p>
              {(cricketLeaders.bestFielders || []).length === 0 ? (
                <div className="text-center py-12 bg-white border-2 border-dashed border-mustard-gold rounded-2xl text-xs font-mono text-slate-400">
                  No fielding dismissals recorded yet
                </div>
              ) : (
                <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono min-w-[480px]">
                    <thead>
                      <tr className="bg-[#082e1c] text-[10px] text-white uppercase">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4 text-left">Player</th>
                        <th className="py-3 px-4 text-left">Club</th>
                        <th className="py-3 px-4 text-center">Field</th>
                        <th className="py-3 px-4 text-center">Awards</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cricketLeaders.bestFielders.map((p, idx) => (
                        <tr key={p.id} className="bg-[#fcf7ed] border-t border-[#faf6ee]">
                          <td className="py-3 px-4 text-center font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 font-sans font-bold">{p.name}</td>
                          <td className="py-3 px-4 uppercase">{p.teamName}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.dismissals}</td>
                          <td className="py-3 px-4 text-center font-bold">{p.awards}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "scorers" && !isCricket && !isSetBased && (
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

            {/* Top Scorers Export — football only */}
            {!isSetBased && !isCricket && (
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
            )}
            {isCricket && (
            <div className="bg-white border-2 border-dashed border-mustard-gold rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-cream-bg border border-slate-200 flex items-center justify-center text-mustard-gold">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-deep-forest uppercase tracking-wider font-mono">Cricket Leaders Export</h4>
                <p className="text-xs text-deep-forest/75 leading-relaxed">
                  Use the Leaders Hub to view run-scorers and wicket-takers for this category.
                </p>
              </div>
            </div>
            )}
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-[10px] font-mono text-slate-450 tracking-wider">
        <p>© 2026 FORCE PULSE</p>
      </footer>
    </div>
  );
}
