# TrainTracks Logic Rebuild Audit - 2026-05-27

## Keep
- Station/fare/auth/map visual data stays in place.
- Map train markers, spectator mode, station dwell/count pills, and upcoming train cards stay as user-facing surfaces.
- DevOpts remains a sandbox surface for MRT-7/Common Station and mock trains.
- `domain/journey` remains the canonical journey/runtime path for route edges, transfers, NAV MODE, fallback state, and arrival state.
- `domain/railway` remains the canonical live/sandbox station filter.

## Replaced
- TrainSight runtime assumptions are replaced by generic `TrainPresence`.
- Raw crowd broadcasts are now clustered by line, direction, station/segment, and timestamp before UI consumption.
- Stale train presence now has `fresh`, `aging`, and `stale` UI state instead of silently disappearing at the old short TTL.
- Crowd presence confidence, source count, and freshness now flow into train tooltips, upcoming trains, and spectator cards.
- Crowd Signal consent UI is now a glassy opt-in modal with clear anonymous/built-line/opt-in affordances.

## Quarantined / Deleted
- Deleted unused legacy trip hooks from `src/hooks/trip`:
  - `useDeadReckoning.ts`
  - `useRouteAlignment.ts`
  - `useStationProgress.ts`
  - `useTransferLogic.ts`
- Removed stale `getFilteredStations` from `src/data/stations.ts`; live/sandbox filtering now routes through `src/domain/railway.ts`.

## Still Pending
- Move remaining fallback/dead-zone thresholds into a dedicated runtime module.
- Convert any remaining location consumers that still read loose GPS fields to `LocationStatus` / `LocationSample`.
- Expand scenario coverage for wrong direction, low accuracy, stale GPS, fallback recovery, and station drift.
- Add browser-level smoke for Crowd Signal, Spectator mode, DevOpts mock trains, and station dwell pills after each production build.
