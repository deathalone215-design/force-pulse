# Match Day — Football Tournament Scoring Application
### Project Plan & Technical Stack

---

## 1. Overview

Match Day is a tournament management application for organizing football (soccer) competitions — creating tournaments, managing teams and squads, scheduling fixtures, recording live match events, and maintaining an automatically calculated points table and top-scorer list.

**Current status:** a working single-file prototype (HTML/CSS/JS) covering the full workflow below, with in-memory (session-only) data. This plan covers both what exists today and the path to a production-ready, persistent, multi-user version.

---

## 2. Core features

| # | Feature | Status |
|---|---|---|
| 1 | Create tournament (name, date, number of teams) | ✅ Built |
| 2 | Add teams (name, logo) | ✅ Built |
| 3 | Add players per team (name, shirt number) | ✅ Built |
| 4 | Manual match scheduler | ✅ Built |
| 5 | Two simultaneous matches per round | ✅ Built |
| 6 | Live match scoring | ✅ Built |
| 7 | Goal tracking by player name | ✅ Built |
| 8 | Own-goal tracking (credited to opposing team) | ✅ Built |
| 9 | Auto-calculated points table (W=3, D=1, L=0) | ✅ Built |
| 10 | Top scorers leaderboard | ✅ Built |
| 11 | Persistent data (save between sessions) | ⏳ Planned |
| 12 | Multi-user / shared tournaments | ⏳ Planned |
| 13 | Knockout brackets (in addition to league table) | ⏳ Planned |
| 14 | Match timer / minute-by-minute events | ⏳ Planned |
| 15 | Cards (yellow/red) and substitutions | ⏳ Planned |
| 16 | Export (PDF fixtures, PDF/Excel standings) | ⏳ Planned |
| 17 | Public read-only view for spectators | ⏳ Planned |

---

## 3. Application architecture

### Phase 1 — Prototype (current)
A single static HTML file with embedded CSS and vanilla JavaScript. All state lives in an in-memory JS object; nothing is persisted or sent to a server. This is ideal for quick, offline, single-device use (e.g. a tournament organizer running scoring on one laptop or tablet, matchside).

```
┌─────────────────────────────┐
│   Browser (client only)     │
│                              │
│  HTML/CSS/JS single file     │
│  ├─ Setup (teams/players)    │
│  ├─ Schedule (rounds)         │
│  ├─ Live scoring              │
│  └─ Standings (computed)      │
│                              │
│  State: in-memory JS object  │
└─────────────────────────────┘
```

### Phase 2 — Persistent single-device app
Add local persistence so data survives refreshes/restarts, still no backend required.

```
┌─────────────────────────────┐
│   Browser                    │
│  App UI (same as above)      │
│  State: synced to local store│
└──────────────┬───────────────┘
               │
       Browser storage (IndexedDB /
       key-value store)
```

### Phase 3 — Multi-user / cloud-synced production app
Needed once multiple organizers, live spectator views, or access from multiple devices are required.

```
┌───────────────┐      ┌───────────────────┐      ┌────────────────┐
│  Web client    │◄────►│   API / backend    │◄────►│   Database      │
│  (React/Vue)   │      │  (REST or GraphQL) │      │ (Postgres/etc.) │
└───────────────┘      └────────┬───────────┘      └────────────────┘
                                  │
                          ┌───────▼────────┐
                          │ Auth & realtime │
                          │ (organizer login,│
                          │ live score push) │
                          └─────────────────┘
```

---

## 4. Technology stack

### 4.1 What's used today (Phase 1 prototype)
| Layer | Technology | Why |
|---|---|---|
| Structure | HTML5 | Single-file distribution, no build step |
| Styling | Hand-written CSS (custom properties) | Full control, no framework overhead for a single page |
| Fonts | Google Fonts — Anton (display/scoreboard), Work Sans (body), Roboto Mono (scores/data) | Distinct sports-scoreboard identity |
| Logic | Vanilla JavaScript (ES6+, IIFE module) | Zero dependencies, works by double-clicking the file |
| Data | In-memory JS object | Simplest possible state management for a single session |
| Images | `FileReader` → base64 data URLs | Lets team logos be embedded without a file server |

### 4.2 Recommended stack for Phase 2 (persistent, still client-only)
| Layer | Technology | Notes |
|---|---|---|
| Framework | React (or continue vanilla JS) | Only needed if UI complexity grows significantly |
| Storage | IndexedDB (via a small wrapper like `idb`) | Larger capacity than localStorage, handles images well |
| Build tooling | Vite | Fast dev server, simple static build output |
| Packaging | Static hosting (Netlify, Vercel, GitHub Pages) or as an installable PWA | Works offline, installable to home screen |

### 4.3 Recommended stack for Phase 3 (multi-user, cloud)
| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + TypeScript | Type safety as data model grows (teams, players, matches, events) |
| State/data fetching | React Query (or SWR) | Caching + sync with backend |
| Backend API | Node.js (Express or Fastify), or a BaaS like Supabase | REST endpoints for tournaments, teams, matches, events |
| Realtime updates | WebSockets or Supabase Realtime / Firebase | Live score push to spectators without polling |
| Database | PostgreSQL | Relational data (tournaments → teams → players → matches → events) fits naturally; strong support for standings queries |
| Auth | Supabase Auth / Auth0 / Firebase Auth | Organizer accounts, role-based access (admin vs. viewer) |
| File storage | S3-compatible object storage (S3, Supabase Storage, Cloudflare R2) | Team logos and any media |
| Hosting | Vercel/Netlify (frontend) + Render/Railway/Supabase (backend & DB) | Low-ops managed hosting suited to a small-to-mid scale app |
| Exports | `pdf-lib` / `jsPDF` for PDF, `SheetJS` for Excel | Fixture lists and standings exports |

### 4.4 Suggested data model (Phase 3)
```
Tournament
 ├─ id, name, start_date, created_by
 └─ Teams (1..N)
     ├─ id, name, logo_url
     └─ Players (1..N)
         ├─ id, name, shirt_number

Round
 ├─ id, tournament_id, date
 └─ Matches (1..2 per round)
     ├─ id, team_a_id, team_b_id, status, score_a, score_b
     └─ MatchEvents (1..N)
         ├─ id, match_id, team_id, player_id, type (goal/own_goal/card), created_at
```

Standings and top scorers become derived queries (aggregations) over `Matches` and `MatchEvents`, rather than stored values — keeping a single source of truth.

---

## 5. Rollout plan

| Stage | Scope | Rough effort |
|---|---|---|
| Stage 1 (done) | Prototype: full workflow, single session, single device | Complete |
| Stage 2 | Add persistent storage so a tournament survives across visits | Small |
| Stage 3 | Multi-device sync via a lightweight backend (single organizer, multiple devices) | Medium |
| Stage 4 | Multi-user accounts, live spectator view, exports, knockout brackets | Larger |

---

## 6. Open decisions

A few choices depend on how the app will actually be used — happy to lock these in once known:
- **Single organizer vs. multiple organizers per tournament?** Affects whether auth/roles are needed at all.
- **Offline use required (matchside, no wifi)?** Favors local-first storage (IndexedDB/PWA) over a cloud backend.
- **Do spectators need a live view?** Determines whether realtime infrastructure (WebSockets) is needed in Phase 3.
- **League format only, or also knockout brackets?** Affects the data model and standings logic.
