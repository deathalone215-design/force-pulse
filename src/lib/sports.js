import { isSetBasedSport as setBasedCheck } from "@/lib/setBasedSports";
import {
  parseExtraTimeMinutes,
  parseFullTimeMinutes,
} from "@/lib/footballClock";

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
  }
  return `${name} · ${sport}${detail}`;
}

/**
 * Normalize API category payloads.
 * Accepts string names or { name, sport, oversPerInnings, fullTimeMinutes, extraTimeMinutes }.
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
    } else if (isFootballSport(sport)) {
      oversPerInnings = null;
      if (fullTimeMinutes == null) {
        throw new Error(
          `Football category "${name}" needs full time between 1 and 120 minutes`
        );
      }
      if (extraTimeMinutes === 0) extraTimeMinutes = null;
    } else {
      oversPerInnings = null;
      fullTimeMinutes = null;
      extraTimeMinutes = null;
    }

    out.push({
      name,
      sport,
      oversPerInnings,
      fullTimeMinutes,
      extraTimeMinutes,
    });
  }

  return out;
}
