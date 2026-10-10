# TrainTracks

TrainTracks is a map-first commuter companion for Metro Manila rail journeys. It helps riders choose a route, follow trip progress, estimate fares, find nearby stations, and understand community-reported conditions without losing sight of the map.

**Live app:** [traintracks.vercel.app](https://traintracks.vercel.app)

> [!IMPORTANT]
> TrainTracks is an independent, experimental project. Predictions, crowd signals, and service notices are not official operator data. Always check current operator advisories before traveling.

## Features

- Map-first journey planning for LRT-1, LRT-2, and MRT-3
- Transfer-aware routing and station-by-station trip progress
- GPS-assisted nearby-station detection, reconnection handling, and wrong-direction alerts
- Fare and ticket selection with a running trip summary
- Community-powered train presence, congestion, and stall signals
- Upcoming-train estimates and service disruption banners
- Companion and spectator modes for active and observed journeys
- Favorite routes, recent trips, profiles, and account recovery through Supabase
- Light, dark, and automatic appearance modes
- Installable Progressive Web App with production offline support
- Built-in API documentation, API console, and administration views

## Network Coverage

| Network | Availability | Notes |
| --- | --- | --- |
| LRT-1 | Live mode | Built network through Dr. Santos |
| LRT-2 | Live mode | Routing, transfers, fares, and trip tracking |
| MRT-3 | Live mode | Routing, transfers, fares, and trip tracking |
| MRT-7 and Common Station | Developer sandbox | Excluded from live mode until operational |
| EDSA bus mode | Developer sandbox | Available only through development controls |

Developer simulation is isolated from live behavior. The public app does not present simulated trains as real trains.

## Technology

| Area | Tools |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Mapping | Leaflet, React Leaflet, project geometry utilities |
| State and motion | Zustand, Framer Motion |
| UI system | Tailwind CSS 3, Radix UI, Lucide |
| Backend | Supabase Auth, Postgres, Realtime, Row Level Security |
| Offline support | Next PWA and Workbox |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 20.9 or newer (Next.js minimum); use a supported Node.js LTS release
- npm
- A Supabase project

### Install and Configure

```bash
npm install
```

Create `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
NEXT_PUBLIC_SITE_URL=https://your-exact-app-host.example
AUTH_ALLOWED_ORIGINS=https://your-exact-preview-host.example
CARTO_BASEMAP_KEY=your-carto-basemap-key
```

The Supabase public values are used by browser and server code. Keep Row Level Security enabled and never expose a Supabase service-role key through a `NEXT_PUBLIC_*` variable. `CARTO_BASEMAP_KEY` is server-only: TrainTracks proxies map tiles so the key never appears in client JavaScript or browser requests.

Database scripts live in [`supabase/`](supabase/). Review schema history and grants before applying migrations. Do not run every legacy script indiscriminately: some reset policies or contain obsolete administrator rules. The new `20261009_api_auth_repair.sql` is an idempotent incremental repair for an existing secured schema with `profile_private`, `user_roles`, `app_config`, `trip_history`, and `api_tokens`. It adds missing configuration columns, server-managed timestamps, and owner-filtered history totals. It does not reset roles, alter public profile column grants, or change the current maintenance flag. Validate it in an isolated database before any separately authorized production application.

OAuth PKCE callbacks remain on the initiating origin. Configure the exact `/auth/callback` URL for every approved host in Supabase's redirect allowlist. Server callbacks accept the two verified TrainTracks production aliases (`traintracks.vercel.app` and `traintracks-aaron-martinezs-projects-ea1c41f7.vercel.app`), the canonical `NEXT_PUBLIC_SITE_URL`, the exact platform `VERCEL_PROJECT_PRODUCTION_URL`, and comma-separated `AUTH_ALLOWED_ORIGINS`. Arbitrary `*.vercel.app` hosts and generated previews are not trusted. Loopback origins are allowed only outside production. A missing verifier fails visibly without forwarding the authorization code to another host. See [Supabase's PKCE contract](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

The reviewed repair Preview uses the stable host [traintracks-preview-aaron-martinezs-projects-ea1c41f7.vercel.app](https://traintracks-preview-aaron-martinezs-projects-ea1c41f7.vercel.app). Its exact origin is configured in Preview-only `AUTH_ALLOWED_ORIGINS`. Begin Google sign-in on that host, not an immutable generated deployment hostname or an old callback URL; PKCE verifier cookies cannot be moved between hosts. Reassign this Preview alias only to a reviewed deployment of this project. Supabase must also permit that exact host's `/auth/callback`; a real Google round trip remains a separate verification gate. Changing an environment variable requires a new deployment to use it. See [Vercel's Preview alias workflow](https://vercel.com/kb/guide/how-to-alias-a-preview-deployment-using-the-cli).

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Geolocation works on localhost; production deployments require HTTPS.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the app and generate PWA assets |
| `npm run start` | Serve a completed production build |
| `npm run lint` | Run the Next.js ESLint rules |
| `npm run test:logic` | Run all domain and data smoke tests |
| `npm run test:train` | Run eleven train-focused suites, including reliability, offline, persistence, notifications and map-icon regressions; excludes bus redevelopment |
| `npm run test:db` | Run actual permission/concurrency checks in an isolated PostgreSQL fixture (see `scripts/fixtures/db/README.md`) |
| `node scripts/api-auth-repair-smoke.mjs` | Run isolated API/auth/config regressions without backend writes |
| `node scripts/prediction-crowd-repair-smoke.mjs` | Verify prediction authority, polling/retry contracts, crowd timestamps and privacy |
| `node scripts/prediction-cors-repair-smoke.mjs` | Verify unrestricted prediction-read wildcard and restricted token origins |
| `node scripts/fare-verification-smoke.mjs` | Reconcile official fare fixtures and report unverified cells |
| `node scripts/frontend-repair-smoke.cjs` | Replay local production frontend fixtures with CLI/headless Chrome; blocks backend writes, not a hosted OAuth or real-phone test |

Focused smoke scripts are also available for journeys, trains, incidents, predictions, station images, bus mode, and logic engines. Before opening a change, run:

```bash
npm run lint
npx tsc --noEmit
npm run test:train
npm run build
```

Run the frontend replay against a separate local production server. It accepts
`FRONTEND_REPAIR_URL` (loopback only), `FRONTEND_REPAIR_PRODUCTION=1`, optional
`PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_CHROME_PATH`. Set
`FRONTEND_REPAIR_PHASE="raw GPS four-state"` for the sensor-hook replay, or
`FRONTEND_REPAIR_PHASE="simulator playback"` for the mounted trip-simulator
controls and live-trip isolation checks. Leave it unset for the complete matrix;
selected-phase runs do not replace the full frontend matrix.
Results and screenshots are ignored local artifacts under `.tmp-edge-debug`.

## Application Routes

| Route | Purpose |
| --- | --- |
| `/` | Main map, journey setup, and active trip |
| `/explorer` | Lines, stations, and favorite journeys |
| `/login` | Sign-in and registration |
| `/profile/setup` | Rider profile setup |
| `/docs` | Public API documentation |
| `/api-console` | Interactive API console |
| `/admin` | Operations and app configuration |

Authentication callbacks, verification, and password resets live under `/auth`. Public data endpoints are under `/api/public`; internal handlers are under `/api`.

### Configuration and History Contracts

`/api/admin/config` requires verified `user_roles` administrator authority. PATCH accepts one or more of `maintenanceMode`, `maintenanceMessage`, `congestionConfig`, `apiConfig`, and `publicApiEnabled`; malformed, empty, unknown, or out-of-bounds edits fail. `apiConfig` is a complete version-1 JSON object validated by `src/domain/config`. It contains `prediction` (`defaultLimit`, `validWindowS`, `stationLookaheadMin`), `corsOrigin`, `crowd` (`intervalMs`, `minSpeedKph`, `requiredSamples`), and `stall` (the numeric detection and anti-abuse controls). Configuration is stored in Postgres, not localStorage; console saved values are replaced only with server-acknowledged values. Existing crowd/stall anti-abuse floors cannot be weakened through these settings. `public_api_enabled` is for public token-authenticated APIs only, never first-party navigation or internal prediction availability.

The shared server loader is `loadServerConfig()` from `src/domain/config/server`; it returns explicit `ready`, `degraded`, or `error` status. Missing-column fallback still reads legacy maintenance flags but reports the schema gap, not a successful full-config load. Screens must preserve active-trip controls through maintenance and configuration failures.

Authenticated `/api/trips` GET retains `{ trips }` with default limit 3 (maximum 100). `pagination=true` or `offset=N` adds `{ pagination: { limit, offset, hasMore, nextOffset } }`; `includeTotals=true` adds owner-wide `{ totals: { totalTrips, totalFare, totalDistance } }` through the new SQL function. POST validates live rail catalog/enums, finite bounds, and timestamps. Optional `completed_at` is accepted; otherwise completion derives from `started_at + duration_minutes`, or the first server receipt if duration is absent. The first stored record for `(user_id, client_trip_id)` wins every retry, including its completion time. PATCH remains restricted to fare, distance, and direction repair fields. Errors are not empty-history successes.

Public profile creation inserts only granted columns; updates use separate owner-bound UPDATE statements. Neither sends `updated_at`, which is maintained by the database. Public reads and administrator authority stay unchanged. PostgreSQL column privileges also apply to insert/conflict writes: [INSERT privilege rules](https://www.postgresql.org/docs/current/sql-insert.html).

## Project Structure

```text
src/app/          Routes, API handlers, and global styles
src/components/   Map, trip, account, alert, and admin interfaces
src/domain/       Typed journey, routing, location, and crowd logic
src/hooks/        GPS, runtime, prediction, realtime, and auth behavior
src/data/         Stations, lines, fares, and static network data
src/store/        Persisted Zustand trip and train state
scripts/          Logic and data smoke tests
supabase/         Database schemas, policies, and migrations
public/           PWA assets, map markers, and station imagery
```

The typed domain layer in `src/domain` is the journey source of truth. UI code should call it instead of duplicating routing, transfer, progress, fallback, or wrong-direction logic.

## Realtime and Privacy

Live train hints come from opt-in, anonymous Supabase Realtime crowd broadcasts. TrainTracks does not use the retired TrainSight proxy path, and developer simulations never feed public live state.

Location supports nearby-station and journey-progress features. Keep collection minimal, avoid storing raw location trails, and preserve the separation between anonymous presence signals and authenticated trip history.

## Deployment

The production app runs at [traintracks.vercel.app](https://traintracks.vercel.app). Another environment needs the public Supabase values, server-only credentials for privileged routes, provider keys for enabled services, exact auth redirect configuration, and reviewed database grants/migrations before `npm run build`.

The PWA plugin is disabled in development and generates `public/sw.js` during production builds.

## Project Status

TrainTracks is under active development. Live mode is intentionally limited to built LRT-1, LRT-2, and MRT-3 infrastructure. Historical planning files may mention retired integrations or future lines; runtime code and `src/domain` are authoritative.

See [`TRAINTRACKS_REPAIR_VERIFICATION_2026-10-09.md`](TRAINTRACKS_REPAIR_VERIFICATION_2026-10-09.md) for the repair/test ledger and release gates, [`TRAINTRACKS_CARD_REFERENCE_2026-10-08.md`](TRAINTRACKS_CARD_REFERENCE_2026-10-08.md) for the 51-card/panel inventory, and [`TRAINTRACKS_UI_REPAIR_HANDOFF.md`](TRAINTRACKS_UI_REPAIR_HANDOFF.md) for the new Claude/Fable controls.

Actual isolated PostgreSQL tests cover permissions, concurrency and migration preservation, but don't establish hosted Google sign-in, GoTrue cookies, production grants or Realtime delivery. Production migrations require schema-management access and backups, not just the app's public Supabase keys. Unverified LRT-1 concession fares, real-phone GPS/compass behavior and deferred Fable controls remain explicit release checks. Don't interpret a successful build or mock test as complete real-world certification.
