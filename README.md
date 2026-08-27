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
| Application | Next.js 14, React 18, TypeScript |
| Mapping | Leaflet, React Leaflet, Turf |
| State and motion | Zustand, Framer Motion |
| UI system | Tailwind CSS 3, Radix UI, Lucide |
| Backend | Supabase Auth, Postgres, Realtime, Row Level Security |
| Offline support | Next PWA and Workbox |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18.17 or newer
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
CARTO_BASEMAP_KEY=your-carto-basemap-key
```

The Supabase public values are used by browser and server code. Keep Row Level Security enabled and never expose a Supabase service-role key through a `NEXT_PUBLIC_*` variable. `CARTO_BASEMAP_KEY` is server-only: TrainTracks proxies map tiles so the key never appears in client JavaScript or browser requests.

Database scripts live in [`supabase/`](supabase/). For a fresh backend, review and apply the profile, trip-history, app-configuration, and relevant incremental migrations in the Supabase SQL editor.

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

Focused smoke scripts are also available for journeys, trains, incidents, predictions, station images, bus mode, and logic engines. Before opening a change, run:

```bash
npm run lint
npm run test:logic
npm run build
```

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

The production app runs at [traintracks.vercel.app](https://traintracks.vercel.app). To deploy another Vercel environment, import the repository, add the two Supabase environment variables, and use `npm run build`.

The PWA plugin is disabled in development and generates `public/sw.js` during production builds.

## Project Status

TrainTracks is under active development. Live mode is intentionally limited to built LRT-1, LRT-2, and MRT-3 infrastructure. Historical planning files may mention retired integrations or future lines; runtime code and `src/domain` are authoritative.
