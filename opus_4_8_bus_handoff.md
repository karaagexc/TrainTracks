# Opus 4.8 Handoff - EDSA Carousel Bus Mode UI Follow-Up

## Completed By Codex
- Added typed Bus Mode primitives:
  - `TransitMode = "train" | "bus"`
  - `LineKind = "rail" | "bus"`
  - `RailLineId`
  - `LineId = RailLineId | "EDSA"`
  - `isRailLine()`, `isBusLine()`, and related railway helpers.
- Added EDSA Carousel as a bus line:
  - `src/data/edsaStops.ts`
  - `src/data/edsa_carousel.json`
  - `EDSA` color: `#8b7355`
  - 24 selectable EDSA Carousel stops from Monumento to PITX.
  - Stop metadata includes stop type, direction availability, coordinate confidence, transfers, aliases, and source refs.
- Added bus fare logic:
  - `calculateEdsaBusFare()`
  - PHP 15 for first 5 km plus PHP 2.65/km after 5 km.
  - Concession support.
- Added bus-aware journey routing:
  - EDSA routes use bus corridor distance.
  - Monumento -> PITX and PITX -> Monumento work.
  - Northbound trips skip southbound-only Tramo.
  - Northbound destination to Tramo is rejected.
  - Verified EDSA-to-rail interchange edges were added for transfer-capable route building.
- Added Bus Mode store flow:
  - `transitMode` in `useTripStore`.
  - Switching to Bus Mode resets active trip state.
  - Bus Mode locks selection to EDSA stops.
- Added minimal Bus Mode UI guards:
  - Spectator mode is disabled as rail-only while Bus Mode is active.
  - Switching to Bus Mode forces Companion behavior.
  - Train markers, predicted train lists, crowd signal modal, station train counts, Line Explorer, and rail alert cards are not rendered for Bus Mode.
- Kept rail-only systems guarded:
  - Predictions remain rail-only.
  - Crowd train presence remains rail-only.
  - Stall reports/incidents remain rail-only.
  - Sim self-train presence remains rail-only.
  - LiveTrainLayer is not mounted in Bus Mode.

## Important Files
- `src/types/index.ts`
- `src/domain/railway.ts`
- `src/data/stations.ts`
- `src/data/edsaStops.ts`
- `src/data/edsa_carousel.json`
- `src/data/fareMatrixBus.ts`
- `src/domain/journey/graph.ts`
- `src/domain/journey/routeBuilder.ts`
- `src/store/useTripStore.ts`
- `src/components/MainApp.tsx`
- `src/components/MapExplorer.tsx`
- `src/components/FareSelector.tsx`
- `scripts/bus-mode-smoke.mjs`

## What Opus 4.8 Should Do Next
- Design the proper Bus Mode UI shell.
- Replace the temporary Train/Bus pill with the final mode switcher.
- Build an EDSA Carousel-specific trip card if train wording feels wrong.
- Build a bus-specific route/progress display if current `TripProgress` rail wording is awkward.
- Decide how bus transfer guidance should look when moving between EDSA and rail.
- Design Bus Mode Spectator later; it is intentionally unavailable for now.
- Design bus stop info cards using the existing Line Explorer / Station Info language, but adapted for stops.
- Add bus operating notes, stop type labels, and transfer badges where useful.
- Keep existing rail UI untouched unless the change is explicitly shared infrastructure.

## Guardrails
- Do not re-enable train prediction, train markers, crowd train broadcasting, stall reports, or rail congestion cards for `EDSA`.
- Do not make fake EDSA train markers.
- Do not include MRT-7/Common Station in public live rail behavior.
- Keep EDSA as Bus Mode, not a rail line.
- Keep Spectator unusable for Bus Mode until a real bus spectator concept exists.
- Keep source refs in `edsaStops.ts`; if coordinates/stops are changed, update source notes too.

## Acceptance Checks
- Bus Mode shows only EDSA Carousel stops.
- Train Mode remains unchanged for LRT-1, LRT-2, MRT-3, and sandbox MRT-7 behavior.
- Spectator toggle is disabled/unusable in Bus Mode.
- Crowd Signal is not available in Bus Mode.
- No train marker or predicted train card appears in Bus Mode.
- Monumento -> PITX and PITX -> Monumento can start a bus trip.
- PITX -> Tramo is rejected because Tramo is southbound-only.
- EDSA fare samples still pass:
  - 5 km = PHP 15
  - 10 km = PHP 28.25
  - 25 km = PHP 68

## Verification Already Passed
- `npm run test:bus`
- `npm run test:logic`
- `npx tsc --noEmit --pretty false --incremental false`
- `npm run lint`
- `npm run build`

## Notes For UI Copy
- Suggested unavailable copy for Bus Mode Spectator: `Rail only`.
- Suggested line name: `EDSA Carousel`.
- Suggested stop badge prefix: `EC`.
- Suggested color: `#8b7355`.
