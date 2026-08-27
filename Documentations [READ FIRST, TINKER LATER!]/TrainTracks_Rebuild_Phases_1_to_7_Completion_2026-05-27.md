# TrainTracks Rebuild Phases 1-7 Completion - 2026-05-27

This pass completes the first clean rebuild sweep without deleting useful UI surfaces. The app now has typed engine boundaries for location, routing, journey, simulator, alerts, and presence, while keeping the current commuter UI, map, train markers, station dwell pills, spectator mode, fares, auth, and DevOpts sandbox.

## Phase 1 - Domain Contracts

- [x] Canonical location contracts added under `src/domain/location`.
- [x] `LocationSample.source` now supports `gps`, `simulation`, and `fallback`.
- [x] Routing facade added under `src/domain/routing`.
- [x] Typed journey events added under `src/domain/journey/events.ts`.
- [x] `JourneyViewModel` is exported as the UI-facing trip contract.
- [x] Smoke tests now validate live/sandbox station filtering and engine contracts.

## Phase 2 - Store Split

- [x] Added `useJourneyStore` compatibility facade for trip selection, route, snapshot, and journey actions.
- [x] Added `useDevOptsStore` facade for simulator, MRT-7 mode, maintenance, GPS override, and mock fleet controls.
- [x] Added `useLocationStore` for the latest typed location sample/status.
- [x] Added `usePreferencesStore` facade for theme, notifications, rush hour, and Crowd Signal consent.
- [x] Kept `useTripStore` as the compatibility source while UI migration continues.

## Phase 3 - Location Engine

- [x] GPS diagnosis centralized in `src/domain/location/status.ts`.
- [x] Station proximity centralized in `src/domain/location/stationProximity.ts`.
- [x] `useSmartLocation` now emits typed `LocationStatus` and `LocationSample`.
- [x] Fallback is no longer represented as DevOpts simulation; it has `source: "fallback"`.
- [x] `RegionGuard` now consumes shared Smart Location instead of making a separate geolocation request.
- [x] `GeofenceScanner`, `NearbyStationsCard`, and `useGatekeeper` route proximity through the location domain.
- [x] Live mode remains strict: no fake/manual GPS bypass for public trips.

## Phase 4 - Journey Engine V2

- [x] Fallback stepping moved into `src/domain/journey/fallback.ts`.
- [x] Wrong-direction evidence moved into `src/domain/alerts/wrongDirection.ts`.
- [x] Stall detection thresholds/window checks moved into `src/domain/alerts/stall.ts`.
- [x] NAV MODE uses typed active transfer edges instead of `statusText` parsing.
- [x] Transfer completion is strict across all transfer pairs covered by smoke tests.
- [x] `statusText.includes(...)` behavior checks are gone from app code.

## Phase 5 - Simulator Engine V2

- [x] Deterministic simulation leg profiles and stepping added under `src/domain/simulation/engine.ts`.
- [x] `useSimEngine` rebuilt around deterministic route priming and per-leg stepping.
- [x] Transfer simulation reports `WALKING`, uses transfer-edge metadata, and feeds the same Smart Location/Journey path as GPS.
- [x] Quick scenarios use deterministic `startScenario(origin, destination)` ordering.
- [x] Sim/fallback samples do not broadcast Crowd Signal.
- [x] Engine smoke tests cover transfer playback behavior.

## Phase 6 - Presence Engine

- [x] TrainSight runtime path remains deprecated and removed from active runtime.
- [x] Supabase Realtime crowd presence listener is exposed as `useRealtimeTrainPresence`.
- [x] Backward `useTrainPolling` name remains as a compatibility alias only.
- [x] `TrainPresence` clustering, freshness, confidence, source count, and public line filtering live in `src/domain/trainPresence.ts`.
- [x] Station dwell summaries are now available through `getStationDwellSummary`.
- [x] Mock fleet emits the same `TrainPresence` shape as crowd presence.
- [x] Train marker, station dwell/count, spectator, and upcoming train UI surfaces are preserved.

## Phase 7 - UI Rewire And Cleanup

- [x] `/explorer` now uses live/sandbox filtering instead of raw station data.
- [x] `MapExplorer` station markers and fallback centering use network filtering.
- [x] `SpectatorInfoCard` supports sandbox station selection when DevOpts enables future rail.
- [x] DevOpts labels now say Crowd Live / Sim Fleet instead of API Live / In-House Mock.
- [x] Missing PWA notification/manifest icon paths now point at existing marker assets.
- [x] Legacy trip hooks under `src/hooks/trip` are deleted.
- [x] TrainSight API routes and service wrapper are deleted from active source.
- [x] Old unused DevControls/DevDashboard remain unimported legacy surfaces and should only be revived through sandbox facades.

## Verification

- [x] `npm run test:logic`
- [x] `npx tsc --noEmit --pretty false --incremental false`
- [x] `npm run lint`
- [x] `npm run build`

## Intentional Compatibility Left

`useTripStore` still exists because the current UI imports it widely. The new split stores are facades and runtime bridges first, so the app avoids duplicate state sources. The next cleanup should migrate components from `useTripStore` to the facades module by module, then remove direct compatibility mutations after each migrated surface passes the smoke suite.
