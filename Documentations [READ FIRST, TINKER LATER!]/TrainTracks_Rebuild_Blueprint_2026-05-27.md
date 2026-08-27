# TrainTracks Full Logic Rebuild Blueprint - 2026-05-27

This is the clean rebuild map after scanning the app source, runtime hooks, stores, domain modules, simulator paths, map/train surfaces, auth/admin surfaces, data files, scripts, docs, and generated artifacts.

Generated files, dependency folders, binaries, OCR scratch dumps, and build output are treated as repo hygiene, not product logic. That includes `.next`, `node_modules`, `train-tracks/node_modules`, `public/sw.js`, `public/workbox-*.js`, font binaries, PDFs, `eng.traineddata`, and raw OCR/API scratch files.

## Goal

Nuke the tangled runtime logic and rebuild it around typed engines, while preserving the app people actually see:

- Companion trip setup and ticket flow.
- Live map, station markers, train markers, dwell/count indicators, and spectator mode.
- NAV MODE transfer guidance.
- Fare calculation and trip history.
- Auth/profile/admin/devops surfaces.
- DevOpts sandbox, including MRT-7/Common Station when explicitly enabled.
- Strict public live behavior: LRT-1, LRT-2, MRT-3 only until future infrastructure is actually built.

## What Is Already Cleaner

- [x] Active TrainSight API runtime has been removed from app code.
- [x] Generic `TrainPresence` exists.
- [x] Supabase Realtime crowd broadcast/listen path exists.
- [x] Crowd train clustering exists in `src/domain/trainPresence.ts`.
- [x] Map train markers still render through `LiveTrainLayer`.
- [x] Station dwell/count pills still render in `MapExplorer`.
- [x] Upcoming train UI is now backed by `TrainPresence`.
- [x] `LocationStatus` has explicit states for checking, permission, insecure context, timeout, unavailable, low accuracy, stale, and ready.
- [x] Public GPS blocker no longer spins forever when the browser exposes a hard blocker.
- [x] Typed transfer state exists in `useTripLogic`.
- [x] NAV MODE is mostly typed edge-driven, not `statusText.includes(...)`.
- [x] Legacy trip hooks under `src/hooks/trip` have been deleted.
- [x] Live/sandbox station filtering mostly routes through `src/domain/railway.ts`.

## Main Problem Left

The codebase now has a typed journey core, but it is still surrounded by compatibility state and side-channel hooks:

- `useTripStore.ts` still stores canonical journey state and legacy UI/runtime fields together.
- `useJourneyRuntime.ts` still owns fallback/dead-zone behavior and mutates simulator fields to fake movement.
- `useSmartLocation.ts` still blends browser GPS, simulator override, status diagnosis, smoothing, and bridge metadata in one hook.
- `useSimEngine.ts` still writes directly into trip store location fields instead of emitting deterministic samples.
- Wrong direction, congestion, stall detection, station proximity, and notifications are separate hooks with their own thresholds and assumptions.
- Some UI and pages still use raw `STATIONS`, loose GPS fields, direct store mutation, old labels, or old TrainSight-era wording.

That is the real nuke target.

## Feature Map

| Feature | Current Entry Points | Rebuild Direction |
| --- | --- | --- |
| Public companion flow | `MainApp`, `TicketCard`, `FareSelector`, `useGatekeeper`, `useSmartLocation` | UI consumes `LocationStatus`, `StationProximityView`, `JourneyViewModel`; no duplicate geofence logic. |
| Trip routing | `domain/journey/routeBuilder`, `graph`, `utils/simRoute`, `fareNew` | Keep graph foundation; remove `simRoute` as a compatibility dependency after fare/routing consume `RoutingEngine`. |
| Journey progress | `domain/journey/engine`, `useJourneyRuntime`, `useTripLogic`, `routeMetrics`, `geo` | `JourneyEngine` becomes source of truth for phase, active edge, progress, arrival, transfer, fallback state. |
| NAV MODE | `domain/journey/engine`, `TripProgress`, `TicketCard` | Keep typed active transfer edge. Completion uses target proximity, path progress, accuracy, and stable phase. |
| GPS/location | `useSmartLocation`, `GPSFallbackHandler`, `GeofenceScanner`, `RegionGuard` | Split into browser adapter, location diagnosis, sample normalizer, and station proximity engine. |
| Dead-zone fallback | `useJourneyRuntime` | Move to `FallbackEngine`; emit `LocationSample.source = "fallback"` instead of using DevOpts override. |
| Wrong direction | `useWrongDirection`, `WrongDirectionAlert`, `fareNew` | Move detector to pure domain module consuming route projection, heading, speed, accuracy, and journey phase. |
| Stall detection | `useStallDetector` | Move to alert engine or journey adjunct; gate by route progress and station zones, not loose GPS samples only. |
| Congestion | `useCongestionAlert`, `data/congestion`, `CongestionAlert`, map station pills | Keep data, expose typed `CongestionViewModel`; use journey display/next station only. |
| Simulator ride | `useSimEngine`, `CommandCenter`, trip store simulated fields | Replace with deterministic `SimulationEngine` that emits the same `LocationSample` stream as real GPS. |
| Simulated fleet | `useMockTrainEngine`, `useTrainStore`, `LiveTrainLayer` | Keep feature, rebuild as deterministic `TrainPresenceSimulationEngine`. |
| Crowd Signal | `useGpsCrowdsource`, `useTrainPolling`, `useTrainStore`, `domain/trainPresence` | Keep opt-in only; feed from canonical journey/location state; no sim/dev broadcasting. |
| Spectator mode | `SpectatorInfoCard`, `MapExplorer`, `LiveTrainLayer`, `useTrainStore` | Keep UI; decouple selection/follow state from presence storage. |
| Auth/profile | `useAuth`, auth pages, profile components, Supabase clients | Keep feature; reduce debug logging and REST fallbacks to service helpers. |
| Admin/DevOps | `/admin`, `CommandCenter`, `AdminDashboard`, maintenance mode | Keep separate; make DevOpts a sandbox runtime, never a live state backdoor. |
| PWA/security/region | `SecurityGuard`, `RegionGuard`, middleware, manifest, PWA config | Keep intent; fix missing icons and avoid duplicate GPS permission paths. |

## Rebuild Architecture

The new runtime should be a one-way pipeline:

1. Inputs
   - Browser GPS
   - DevOpts simulation
   - Fallback/dead-zone extrapolation
   - User actions
   - Crowd train presence

2. Engines
   - `LocationEngine`: permission, secure context, freshness, accuracy, heading, speed, source.
   - `RoutingEngine`: graph, line direction, transfers, live/sandbox filter, route distances.
   - `JourneyEngine`: reducer for phase, active edge, progress, transfer, fallback, arrival.
   - `SimulationEngine`: deterministic scenarios that emit `LocationSample`.
   - `PresenceEngine`: crowd aggregation, stale state, station dwell counts, train marker view models.
   - `AlertEngine`: wrong direction, stall, congestion, fallback recovery.
   - `FareEngine`: fare segments and total fare from canonical route.

3. Stores
   - `journeyStore`: selected trip, snapshot, user events.
   - `locationStore`: latest typed `LocationSample` and `LocationStatus`.
   - `devOptsStore`: simulator, MRT-7 mode, maintenance/dev controls.
   - `presenceStore`: raw and clustered train presence, spectator selection.
   - `preferencesStore`: theme, notifications, welcome/rules dismissed, crowd consent.

4. UI
   - UI reads only view models, never raw status strings for behavior.
   - `statusText` remains display-only.

## File Classification

### Keep As Product Surfaces

- `src/components/MainApp.tsx`
- `src/components/TicketCard.tsx`
- `src/components/TripProgress.tsx`
- `src/components/MapExplorer.tsx`
- `src/components/LiveTrainLayer.tsx`
- `src/components/UpcomingTrainsCard.tsx`
- `src/components/SpectatorInfoCard.tsx`
- `src/components/FareSelector.tsx`
- `src/components/LineExplorer.tsx`
- `src/components/StationInfoModal.tsx`
- `src/components/TripHistoryModal.tsx`
- `src/components/RecentTripsCard.tsx`
- `src/components/AuthModal.tsx`
- `src/components/ProfileDrawer.tsx`
- `src/components/ProfileSetupModal.tsx`
- `src/components/CommandCenter.tsx`
- `src/components/AdminDashboard.tsx`
- `src/components/screens/*`

These should be preserved visually, then rewired to typed view models and smaller component boundaries.

### Keep As Data, With Validation

- `src/data/stations.ts`
- `src/data/transfers.ts`
- `src/data/segmentDistances.ts`
- `src/data/fareMatrix.ts`
- `src/data/congestion.ts`
- `src/data/stationInfo.ts`
- `src/data/lrt1.json`
- `src/data/lrt2.json`
- `src/data/mrt3.json`
- `src/data/mrt7.json`
- `public/gps-markers/*`

Add validation tests so bad station IDs, missing segment distances, or live MRT-7 leakage fail fast.

### Keep And Expand

- `src/domain/railway.ts`
- `src/domain/journey/graph.ts`
- `src/domain/journey/routeBuilder.ts`
- `src/domain/journey/types.ts`
- `src/domain/trainPresence.ts`
- `src/types/index.ts`
- `src/types/train.ts`
- `scripts/journey-smoke.mjs`
- `scripts/train-presence-smoke.mjs`

These are the healthiest foundation. They need expansion, not deletion.

### Rebuild In Place

- `src/store/useTripStore.ts`
  - Split into journey, selection, preferences, and dev stores.
  - Compatibility fields should become selectors/view models, not mutable source state.

- `src/hooks/useSmartLocation.ts`
  - Split browser GPS adapter from typed diagnosis and sample normalization.
  - Add `fallback` as a `LocationSample.source`.

- `src/hooks/useJourneyRuntime.ts`
  - Replace side effects with a small engine input loop.
  - Remove fallback mutation through `setGpsOverride` and `setSimulatedLocation`.

- `src/hooks/useSimEngine.ts`
  - Replace with deterministic scenario playback.
  - Output typed samples, not direct trip store mutation.

- `src/hooks/useMockTrainEngine.ts`
  - Keep mock train feature, rebuild as deterministic presence simulation.

- `src/hooks/useWrongDirection.ts`
  - Move thresholds and detection into a pure domain detector with tests.

- `src/hooks/useGatekeeper.ts` and `src/components/GeofenceScanner.tsx`
  - Replace duplicate station proximity logic with `StationProximityEngine`.

- `src/hooks/useStallDetector.ts`
  - Rebase on route projection and journey phase.

- `src/hooks/useCongestionAlert.ts`
  - Rebase on `JourneyViewModel`.

- `src/hooks/useGpsCrowdsource.ts`
  - Rebase on canonical `LocationSample` and `JourneySnapshot`.

- `src/hooks/useTrainPolling.ts`
  - Rename/rebuild around realtime presence, not polling.

- `src/utils/fareNew.ts`
  - Move to `FareEngine`; stop importing `utils/simRoute`.

- `src/utils/geo.ts` and `src/utils/routeMetrics.ts`
  - Keep math, but move projection/segment APIs into routing/journey domain.

### Quarantine Or Delete After Migration

- `src/utils/simRoute.ts`
  - Compatibility wrapper only.

- `src/utils/telemetryMapper.ts`
  - No-op leftover from TrainSight shape.

- `src/components/DevControls.tsx`
  - Not imported; old manual shortcut.

- `src/components/DevDashboard.tsx`
  - Not imported; old teleport panel with direct journey mutation.

- `src/components/TrackingCard.tsx`
  - Not imported by current app flow.

- `src/components/InfoCard.tsx`
  - Not imported by current app flow.

- `src/components/NearbyStationsCard.tsx`
  - Imported but not rendered in the current main flow; uses raw `STATIONS` and can leak MRT-7 if revived unchanged.

- Root TrainSight/test scratch files:
  - `test-api*.mjs`
  - `test-api-results.txt`
  - `api_docs.txt`
  - `api_pages/*`
  - `ocr_docs.mjs`

- OCR/fetch scratch:
  - `eng.traineddata`
  - `fetch_mrt7_coords.mjs`
  - `fetch_wiki.mjs`
  - `wiki_results.txt`
  - `line7.txt`
  - `mrt7_coords.json`
  - `*.xhr`

- Nested dependency project:
  - `train-tracks/`

Do not delete these silently. Move/delete in a dedicated cleanup commit after confirming they are not needed.

### Generated Or Ignore

- `.next/`
- `node_modules/`
- `.vercel/`
- `.tmp-edge-debug/`
- `public/sw.js`
- `public/workbox-*.js`
- `tsconfig.tsbuildinfo`
- `next-env.d.ts`
- PDFs and binary font/image assets unless specifically editing assets.

## Known Hazards

- `src/app/explorer/page.tsx` uses raw `STATIONS`, so MRT-7 can appear on that route even when live mode should hide it.
- `src/components/NearbyStationsCard.tsx` also uses raw `STATIONS`; it is not active now, but it is unsafe if reused.
- `src/components/CommandCenter.tsx` still says `API Live`; wording should become `Crowd Live` or `Realtime`.
- `src/hooks/useJourneyRuntime.ts` uses DevOpts GPS override fields for fallback. This blurs live fallback with simulator behavior.
- `src/hooks/useSmartLocation.ts` is doing too much at once.
- `RegionGuard` calls geolocation separately from `useSmartLocation`, which can create duplicate GPS behavior and inconsistent diagnostics.
- `manifest.json` and notifications reference `/icons/icon-192x192.png` and `/icons/icon-512x512.png`, but `public/icons` is missing.
- Several UI files contain mojibake text such as `â€”`, `â€¢`, and `â‚±`; clean encoding before polishing copy.
- Debug `console.log`, `alert`, `confirm`, `any`, and `@ts-ignore` are scattered through admin/dev/auth/map files.
- `SecurityGuard` uses aggressive client-side anti-tamper behavior. Keep it separate from the journey rebuild and review carefully before production.

## Rebuild Tasklist

### Phase 1 - Domain Contracts

- [ ] Add `src/domain/location/types.ts` with `LocationSample`, `LocationStatus`, `LocationSource`, `LocationDiagnosis`.
- [ ] Add `LocationSample.source = "gps" | "simulation" | "fallback"`.
- [ ] Add `src/domain/routing` facade over railway graph, route projection, transfer metadata, and live/sandbox filtering.
- [ ] Add `src/domain/journey/events.ts` for typed journey inputs.
- [ ] Add `JourneyViewModel` as the only trip UI contract.
- [ ] Add station/data validation tests.

### Phase 2 - Store Split

- [ ] Create `journeyStore` for selected trip and `JourneySnapshot`.
- [ ] Create `devOptsStore` for simulator, MRT-7 mode, maintenance/dev switches.
- [ ] Create `locationStore` for current sample/status.
- [ ] Create `preferencesStore` for UI preferences and notification settings.
- [ ] Keep compatibility exports temporarily, then remove direct mutation actions like `setCurrentStation`, `setNextStation`, and `setStatus`.

### Phase 3 - Location Engine

- [ ] Extract browser geolocation adapter from `useSmartLocation`.
- [ ] Centralize secure-context, permission, timeout, unavailable, stale, and low-accuracy diagnosis.
- [ ] Replace `RegionGuard` direct geolocation with shared location status/sample.
- [ ] Replace `useGatekeeper` and `GeofenceScanner` proximity duplication with `StationProximityEngine`.
- [ ] Ensure live mode never offers fake/manual GPS bypass.

### Phase 4 - Journey Engine V2

- [ ] Move fallback activation/recovery out of `useJourneyRuntime`.
- [ ] Move wrong-direction detection into domain.
- [ ] Move stall detection into domain.
- [ ] Make route projection and segment progress one canonical function.
- [ ] Ensure every transfer pair has strict entry, walking, completion, and recovery tests.
- [ ] Make status text display-only everywhere.

### Phase 5 - Simulator Engine V2

- [ ] Replace `useSimEngine` with deterministic scenario playback.
- [ ] Feed simulator output through the same `LocationEngine`/`JourneyEngine` intake as GPS.
- [ ] Add scenarios for direct rides, all transfer pairs, wrong direction, low accuracy, stale GPS, underground loss, stalled train, and recovery.
- [ ] Keep DevOpts sim from broadcasting real Crowd Signal.
- [ ] Replace `CommandCenter` old route override side effects with typed scenario controls.

### Phase 6 - Presence Engine

- [ ] Rename `useTrainPolling` to realtime presence listener.
- [ ] Keep crowd clustering and add tests for station dwell counts, stale UI, duplicate suppression, and live MRT-7 exclusion.
- [ ] Rebuild mock train engine as deterministic `TrainPresence` scenarios.
- [ ] Keep train markers, dwell station pills, spectator cards, and upcoming trains.
- [ ] Polish Crowd Signal and train cards after the data contract is stable.

### Phase 7 - UI Rewire And Cleanup

- [ ] Rewire `TicketCard`, `TripProgress`, `UpcomingTrainsCard`, and `MapExplorer` to typed view models.
- [ ] Remove orphan components or move them to a legacy quarantine folder.
- [ ] Fix `/explorer` live/sandbox filtering.
- [ ] Fix missing PWA icons or update manifest/notification icon paths.
- [ ] Clean mojibake text.
- [ ] Reduce debug logs and browser alerts in production-facing flows.
- [ ] Update stale docs that still describe TrainSight as active.

## Acceptance Tests

- [ ] Live routing never includes MRT-7/Common Station.
- [ ] Sandbox DevOpts can include MRT-7/Common Station only when Line 7 mode is enabled.
- [ ] Direct trips never enter NAV MODE.
- [ ] Every transfer enters NAV MODE at the active transfer edge.
- [ ] Transfer completion never triggers early from loose station drift.
- [ ] GPS blocker explains insecure, denied, timeout, stale, low accuracy, and unavailable states.
- [ ] Fallback remains quiet until there is stable evidence.
- [ ] Wrong-direction alert requires route projection, heading, speed, accuracy, and persistence.
- [ ] Sim quick scenarios start deterministically and drive the same journey engine.
- [ ] Sim mode never sends real Crowd Signal.
- [ ] Crowd train presence clusters anonymous signals and keeps stale UI visible.
- [ ] Station dwell pills show train count, directions, source count, and stale state.
- [ ] Production build, TypeScript, lint, journey smoke, train smoke all pass.

## Final Direction

The app should not be rewritten as a new product. The correct nuke is surgical:

- Keep the visuals and commuter-facing feature set.
- Replace mixed hooks and mutable compatibility state with typed engines.
- Let DevOpts be a sandbox, not a hidden live-mode mutation path.
- Let real GPS, fallback, and sim all enter through one strict input contract.
- Let UI consume view models instead of interpreting strings or store internals.

