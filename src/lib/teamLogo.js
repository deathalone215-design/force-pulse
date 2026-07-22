/**
 * Club / entry logos — single source of truth for when URLs are kept vs dropped.
 * Never strip normal club crests (~40–80KB data URLs or http(s) links).
 */

/** Only drop embedded images larger than this (tournament hero banners, not crests). */
export const MAX_EMBEDDED_LOGO_CHARS = 500_000;

/** True when the URL is safe to send to the client and render. */
export function isRenderableLogoUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("http://") || url.startsWith("https://")) return true;
  if (url.startsWith("data:")) return url.length <= MAX_EMBEDDED_LOGO_CHARS;
  return url.length > 0;
}

/**
 * Keep logo URLs for API payloads. Strips only mega embedded images (rare).
 * http(s) Supabase URLs are always kept.
 */
export function preserveLogoUrl(url) {
  if (!url || typeof url !== "string") return null;
  return isRenderableLogoUrl(url) ? url : null;
}

/** List/card payloads — omit only mega banners; keep club/tournament crests. */
export function listLogoUrl(url) {
  return preserveLogoUrl(url);
}

function firstPlayerLogo(team) {
  const p = team?.players?.[0];
  return p?.logoUrl || null;
}

/**
 * Resolve a club/entry avatar from the team row and/or category roster.
 * Match rows may omit duplicate data-URLs — roster always has the canonical logo.
 */
export function resolveTeamLogo(team, categoryOrTeams) {
  if (!team) return null;

  const teams = Array.isArray(categoryOrTeams)
    ? categoryOrTeams
    : categoryOrTeams?.teams;

  const fromRoster = teams?.find((t) => t.id === team.id);

  const candidates = [
    team.logoUrl,
    firstPlayerLogo(team),
    fromRoster?.logoUrl,
    firstPlayerLogo(fromRoster),
  ];

  for (const url of candidates) {
    if (isRenderableLogoUrl(url)) return url;
  }
  return null;
}

/** Attach canonical logo + players from category roster onto a match side. */
export function enrichMatchTeamSide(side, rosterTeam) {
  if (!side) return side;
  if (!rosterTeam) return side;
  const logo = preserveLogoUrl(rosterTeam.logoUrl || side.logoUrl);
  return {
    ...side,
    name: rosterTeam.name || side.name,
    logoUrl: logo,
    players: rosterTeam.players?.length ? rosterTeam.players : side.players || [],
  };
}
