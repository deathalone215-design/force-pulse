import { isSetBasedSport as setBasedCheck } from "@/lib/setBasedSports";

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

/** Public/admin chip: "OPEN · Football" */
export function categoryDisplayName(category) {
  if (!category) return "";
  const name = category.name || "";
  const sport = sportLabel(category.sport);
  const overs =
    isCricketSport(category.sport) && category.oversPerInnings
      ? ` · ${category.oversPerInnings} ov`
      : "";
  return `${name} · ${sport}${overs}`;
}

/**
 * Normalize API category payloads.
 * Accepts string names or { name, sport, oversPerInnings }.
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

    if (typeof raw === "string") {
      name = raw.trim();
    } else if (raw && typeof raw === "object") {
      name = String(raw.name || "").trim();
      sport = normalizeSport(raw.sport || fallback);
      if (isCricketSport(sport) && raw.oversPerInnings != null) {
        const ov = parseInt(raw.oversPerInnings, 10);
        oversPerInnings = Number.isFinite(ov) ? ov : null;
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
    } else {
      oversPerInnings = null;
    }

    out.push({ name, sport, oversPerInnings });
  }

  return out;
}
