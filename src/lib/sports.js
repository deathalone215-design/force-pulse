import { isSetBasedSport as setBasedCheck, defaultSetScoring } from "@/lib/setBasedSports";
import {
  parseExtraTimeMinutes,
  parseFullTimeMinutes,
} from "@/lib/footballClock";
import { resolveTeamLogo } from "@/lib/teamLogo";

/** Shared sport helpers for Force Pulse tournaments. */

export const SPORTS = [
  "FOOTBALL",
  "CRICKET",
  "VOLLEYBALL",
  "BADMINTON",
  "PICKLEBALL",
];

export function normalizeSport(value) {
  const s = String(value || "FOOTBALL").toUpperCase().trim();
  return SPORTS.includes(s) ? s : "FOOTBALL";
}

export function isCricketSport(sport) {
  return normalizeSport(sport) === "CRICKET";
}

export function isFootballSport(sport) {
  return normalizeSport(sport) === "FOOTBALL";
}

export function isSetBasedSport(sport) {
  return setBasedCheck(normalizeSport(sport));
}

/** Badminton / pickleball Singles — register as a player, not a club. */
export function isSinglesCategory(category) {
  if (!category || !isSetBasedSport(category.sport)) return false;
  return /singles/i.test(String(category.name || ""));
}

/** Badminton / pickleball Doubles or Mixed pairs. */
export function isDoublesOrMixedCategory(category) {
  if (!category || !isSetBasedSport(category.sport)) return false;
  const n = String(category.name || "");
  return /doubles|mixed/i.test(n);
}

/** UI copy: Player | Pair | Club */
export function entryLabel(category) {
  if (isSinglesCategory(category)) return "Player";
  if (isDoublesOrMixedCategory(category)) return "Pair";
  return "Club";
}

export function entryLabelPlural(category) {
  if (isSinglesCategory(category)) return "Players";
  if (isDoublesOrMixedCategory(category)) return "Pairs";
  return "Clubs";
}

/** Prefer entry logo, then first player's photo (Singles). */
export function entryAvatarUrl(team) {
  if (!team) return null;
  if (team.logoUrl) return team.logoUrl;
  const p = team.players?.[0];
  return p?.logoUrl || null;
}

export { resolveTeamLogo, preserveLogoUrl, isRenderableLogoUrl } from "@/lib/teamLogo";

/** @deprecated Prefer resolveTeamLogo(team, category) */
export function resolveEntryAvatar(team, category) {
  return resolveTeamLogo(team, category);
}

export function sportLabel(sport) {
  const s = normalizeSport(sport);
  if (s === "CRICKET") return "Cricket";
  if (s === "VOLLEYBALL") return "Volleyball";
  if (s === "BADMINTON") return "Badminton";
  if (s === "PICKLEBALL") return "Pickleball";
  return "Football";
}

/** Public/admin chip: "OPEN · Football · 20'+2'" */
export function categoryDisplayName(category) {
  if (!category) return "";
  const name = category.name || "";
  const sport = sportLabel(category.sport);
  let detail = "";
  if (isCricketSport(category.sport) && category.oversPerInnings) {
    detail = ` · ${category.oversPerInnings} ov`;
  } else if (isFootballSport(category.sport) && category.fullTimeMinutes) {
    const extra = parseExtraTimeMinutes(category.extraTimeMinutes);
    detail =
      extra > 0
        ? ` · ${category.fullTimeMinutes}'+${extra}`
        : ` · ${category.fullTimeMinutes}'`;
  } else if (
    isSetBasedSport(category.sport) &&
    category.pointsPerSet &&
    category.setsToWin
  ) {
    detail = ` · to ${category.pointsPerSet} · first to ${category.setsToWin}`;
  }
  return `${name} · ${sport}${detail}`;
}

function parsePositiveInt(value, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Normalize API category payloads.
 * Accepts string names or { name, sport, oversPerInnings, fullTimeMinutes, extraTimeMinutes,
 * pointsPerSet, setsToWin, maxSets, lastSetPoints, pointCap }.
 */
export function parseCategoryInputs(categories, fallbackSport = "FOOTBALL") {
  if (!Array.isArray(categories)) return [];
  const fallback = normalizeSport(fallbackSport);
  const out = [];
  const seen = new Set();

  for (const raw of categories) {
    let name;
    let sport = fallback;
    let oversPerInnings = null;
    let fullTimeMinutes = null;
    let extraTimeMinutes = null;
    let pointsPerSet = null;
    let setsToWin = null;
    let maxSets = null;
    let lastSetPoints = null;
    let pointCap = null;

    if (typeof raw === "string") {
      name = raw.trim();
    } else if (raw && typeof raw === "object") {
      name = String(raw.name || "").trim();
      sport = normalizeSport(raw.sport || fallback);
      if (isCricketSport(sport) && raw.oversPerInnings != null) {
        const ov = parseInt(raw.oversPerInnings, 10);
        oversPerInnings = Number.isFinite(ov) ? ov : null;
      }
      if (isFootballSport(sport)) {
        fullTimeMinutes = parseFullTimeMinutes(raw.fullTimeMinutes);
        extraTimeMinutes = parseExtraTimeMinutes(raw.extraTimeMinutes);
      }
      if (isSetBasedSport(sport)) {
        const defaults = defaultSetScoring(sport);
        pointsPerSet =
          parsePositiveInt(raw.pointsPerSet, 1, 99) ?? defaults.pointsPerSet;
        setsToWin = parsePositiveInt(raw.setsToWin, 1, 5) ?? defaults.setsToWin;
        maxSets =
          parsePositiveInt(raw.maxSets, setsToWin, 9) ??
          Math.max(setsToWin * 2 - 1, setsToWin);
        lastSetPoints =
          parsePositiveInt(raw.lastSetPoints, 1, 99) ??
          (sport === "VOLLEYBALL" ? defaults.lastSetPoints : pointsPerSet);
        if (raw.pointCap === null || raw.pointCap === "") {
          pointCap = null;
        } else if (raw.pointCap != null) {
          pointCap = parsePositiveInt(raw.pointCap, 1, 99);
        } else {
          pointCap = defaults.pointCap;
        }
      }
    } else {
      continue;
    }

    if (!name) continue;
    const key = `${sport}::${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (isCricketSport(sport)) {
      if (!oversPerInnings || oversPerInnings < 1 || oversPerInnings > 50) {
        throw new Error(
          `Cricket category "${name}" needs overs per innings between 1 and 50`
        );
      }
      fullTimeMinutes = null;
      extraTimeMinutes = null;
      pointsPerSet = null;
      setsToWin = null;
      maxSets = null;
      lastSetPoints = null;
      pointCap = null;
    } else if (isFootballSport(sport)) {
      oversPerInnings = null;
      if (fullTimeMinutes == null) {
        throw new Error(
          `Football category "${name}" needs full time between 1 and 120 minutes`
        );
      }
      if (extraTimeMinutes === 0) extraTimeMinutes = null;
      pointsPerSet = null;
      setsToWin = null;
      maxSets = null;
      lastSetPoints = null;
      pointCap = null;
    } else if (isSetBasedSport(sport)) {
      oversPerInnings = null;
      fullTimeMinutes = null;
      extraTimeMinutes = null;
      if (!pointsPerSet || !setsToWin) {
        throw new Error(
          `${sportLabel(sport)} category "${name}" needs points per set and sets to win`
        );
      }
    } else {
      oversPerInnings = null;
      fullTimeMinutes = null;
      extraTimeMinutes = null;
      pointsPerSet = null;
      setsToWin = null;
      maxSets = null;
      lastSetPoints = null;
      pointCap = null;
    }

    out.push({
      name,
      sport,
      oversPerInnings,
      fullTimeMinutes,
      extraTimeMinutes,
      pointsPerSet,
      setsToWin,
      maxSets,
      lastSetPoints,
      pointCap,
    });
  }

  return out;
}
