# TrainTracks Triple Audit Report

Date: 2026-04-10  
Auditor: Codex

## Executive Summary

The codebase does work in the narrow sense that the app can still build and run, but the current system is not structurally honest.

The strongest version of your theory is correct: the main risk is not one isolated bad formula. The main risk is duplicated trip, progress, transfer, ETA, and simulation logic that has drifted apart while lint and type enforcement are explicitly bypassed. The result is a system that can look functional in production while carrying contradictions between the docs, the store contract, the hooks, and the UI.

The most serious problems are:

- Build validation is intentionally disabled in `next.config.mjs:14` and `next.config.mjs:17`, so production builds can pass while the codebase is already failing lint and TypeScript.
- Route/progress state has more than one source of truth. `useTripStore.ts:45` and `useTripStore.ts:297` describe `advanceToStation()` as the atomic path, but `useSimEngine.ts:141`, `useSimEngine.ts:154`, `useSimEngine.ts:176`, `useSimEngine.ts:246`, `useSimEngine.ts:263`, `useSimEngine.ts:287`, and `useSimEngine.ts:317` still write directly into store state.
- `useStationProgress.ts:81`, `useStationProgress.ts:82`, `useStationProgress.ts:329`, `useTripLogic.ts:94`, and `useTripLogic.ts:168` prove that total progress is computed in two places and then overridden.
- Security boundaries are weak in several different layers: public TrainSight env use in `src/services/trainSightApi.ts:18`, `src/services/trainSightApi.ts:19`, `src/app/api/trainsight/trains/route.ts:11`, `src/app/api/trainsight/trains/route.ts:12`, a hardcoded alpha PIN in `src/components/AuthGate.tsx:11`, token prefix logging in `src/components/ChangePasswordModal.tsx:130`, and open update policy in `supabase/fix_app_config_rls.sql:5`.
- The tracked repo is dominated by vendored baggage. `git ls-files` reports 26,192 tracked files, and 26,000 of them are inside `train-tracks/node_modules`.

## Scope And Method

This was done in three passes.

1. Pass 1: inventory and structural read of the repository tree, including root config, scripts, Supabase SQL, public assets, docs, tests, and all first-party code under `src/`.
2. Pass 2: cross-file behavioral audit focused on route math, trip state, transfer logic, fare logic, telemetry mapping, security boundaries, and doc drift.
3. Pass 3: verification with runtime/tooling checks and reconciliation against the existing markdown docs.

Tracked-file inventory from `git ls-files`:

- Total tracked files: 26,192
- `src/`: 120 files
- `supabase/`: 6 files
- `public/`: 14 files
- Nested vendored payload under `train-tracks/node_modules/`: 26,000 files

Practical note:

- I semantically reviewed the first-party text/code/config/docs/SQL/scripts.
- The vendored `train-tracks/node_modules` payload and binary assets were included in inventory and repo-hygiene analysis, but not treated as first-party application logic.

## Severity-Ranked Findings

### P0. Build integrity is disabled, so the repo can ship broken code

- `next.config.mjs:14` sets `ignoreDuringBuilds: true`.
- `next.config.mjs:17` sets `ignoreBuildErrors: true`.
- `eslint.config.mjs:1` imports from `eslint/config`, while `package.json:41` pins ESLint `^8`.
- `npm run lint` fails because the ESLint config/runtime combination is not valid.
- `npx tsc --noEmit` fails, with current errors recorded in `tsc_output.txt:1` through `tsc_output.txt:9`.
- `npm run build` succeeds only because lint and TS checks are skipped.

Impact:

- The repo cannot currently use the build as evidence of correctness.
- This hides regressions in route logic, MRT-7 typing, Leaflet props, and notification typing.

### P0. The trip engine has multiple sources of truth

- `src/store/useTripStore.ts:45` and `src/store/useTripStore.ts:297` define `advanceToStation()` as the single atomic mutation.
- `src/hooks/useSimEngine.ts:81`, `src/hooks/useSimEngine.ts:84`, `src/hooks/useSimEngine.ts:134`, `src/hooks/useSimEngine.ts:161`, `src/hooks/useSimEngine.ts:273`, `src/hooks/useSimEngine.ts:358`, and `src/hooks/useSimEngine.ts:375` use `advanceToStation()`.
- But `src/hooks/useSimEngine.ts:141`, `src/hooks/useSimEngine.ts:154`, `src/hooks/useSimEngine.ts:176`, `src/hooks/useSimEngine.ts:246`, `src/hooks/useSimEngine.ts:263`, `src/hooks/useSimEngine.ts:287`, and `src/hooks/useSimEngine.ts:317` also mutate trip-adjacent state directly via `useTripStore.setState(...)`.
- `src/hooks/trip/useStationProgress.ts:26` says station advancement uses only `advanceToStation()`, but `src/hooks/useTripLogic.ts` still overlays separate distance-based state.

Impact:

- The store contract is no longer singular.
- Simulation, transfer, and UI state can diverge because the system mixes “atomic transition” design with side-channel writes.

### P0. Total progress math is duplicated and already known to fight itself

- `src/hooks/trip/useStationProgress.ts:39` owns `totalProgress` as local state.
- `src/hooks/trip/useStationProgress.ts:81` and `src/hooks/trip/useStationProgress.ts:82` explicitly admit that `useTripLogic.ts` overrides it every cycle.
- `src/hooks/trip/useStationProgress.ts:329` labels its own total progress as “basic”.
- `src/hooks/useTripLogic.ts:94` reads `progress.totalProgress`, then recomputes and returns `finalTotalProgress` at `src/hooks/useTripLogic.ts:168`.
- The known-issues doc already records this symptom at `TrainTracks_Known_Issues.md:62`.

Impact:

- The app has two progress models: one station-centric and one route-distance-centric.
- That is the clearest “spaghetti math” signal in the repo.

### P0. Security boundaries are loose in ways that matter

- TrainSight access still relies on `NEXT_PUBLIC_` values in `src/services/trainSightApi.ts:18`, `src/services/trainSightApi.ts:19`, `src/app/api/trainsight/trains/route.ts:11`, `src/app/api/trainsight/trains/route.ts:12`, and `src/app/api/trainsight/gps/route.ts:11`.
- `src/components/AuthGate.tsx:11` hardcodes the alpha PIN as `"0710"`.
- `src/components/ChangePasswordModal.tsx:130` logs a token prefix.
- `src/components/SecurityGuard.tsx:172` and `src/components/SecurityGuard.tsx:206` use debugger probes and the component aggressively destroys the DOM when DevTools are detected.
- `supabase/fix_app_config_rls.sql:5` creates the policy `"Anyone can update app_config"`.
- Top-level test scripts contain hardcoded live-looking secrets:
  - `test-api.mjs:3`
  - `test-api-2.mjs:1`
  - `test-api-full.mjs:34`
  - `test-supabase-config.mjs:4`

Impact:

- The repo currently mixes public env exposure, client-side auth workflows, diagnostic token logging, and permissive RLS changes.
- This is not one bug. It is a weak security posture across multiple layers.

### P1. MRT-7 is correctly dev-gated, but incomplete once enabled

- The gating is real:
  - `src/store/useTripStore.ts:389`
  - `src/data/stations.ts:136`
  - `src/components/FareSelector.tsx:19`
  - `src/components/LineExplorer.tsx:177`
  - `src/components/MapExplorer.tsx:572`
- The underlying route/fare engine is still incomplete:
  - `src/utils/simRoute.ts:6` defines `TRANSFER_MAP` with only LRT1, LRT2, and MRT3 entries.
  - `src/data/transfers.ts:21`, `src/data/transfers.ts:47`, and `src/data/transfers.ts:73` only model LRT1/LRT2/MRT3 interchange sets.
  - `src/utils/fareNew.ts:32` and `src/utils/fareNew.ts:104` depend on `TRANSFER_MAP` for cross-line pricing.
  - `src/app/explorer/page.tsx:13` and `src/app/explorer/page.tsx:17` still type the explorer around only three lines.

Impact:

- MRT-7 is not “fake public support”.
- It is a partial feature-flagged implementation whose route, transfer, and fare core is not fully generalized.

### P1. Operating-hours enforcement is disabled, and Holy Week is hardcoded

- `src/components/MainApp.tsx:64` comments out `useOperatingHours()`.
- `src/components/MainApp.tsx:65` hardcodes `const isOpen = true;`.
- `src/components/MainApp.tsx:237` through `src/components/MainApp.tsx:246` hardcode a Holy Week window and guard screen.
- `src/components/screens/ClosedScreen.tsx:53` and `src/components/screens/ClosedScreen.tsx:65` display `4:30 AM` and `11:20 PM`.
- The project doc still describes `useOperatingHours.ts` as `4:30 AM – 10:30 PM PHT` at `TrainTracks_Project_Documentation.md:358`.

Impact:

- The app-level gating described in docs is not the gating actually being enforced.
- Date-window policy is currently coded directly into the app shell.

### P1. `useMaintenanceMode` has a stale-closure polling bug

- `src/hooks/useMaintenanceMode.ts:17` reads `maintenanceMode` from Zustand.
- `src/hooks/useMaintenanceMode.ts:35` compares the fetched backend flag against that captured value.
- `src/hooks/useMaintenanceMode.ts:43` to `src/hooks/useMaintenanceMode.ts:49` set an interval but intentionally suppress effect dependencies.

Impact:

- Later remote changes can be compared against stale local state.
- This bug is not currently listed in `TrainTracks_Known_Issues.md`.

### P1. Dead reckoning advertises a safety rule that the code does not enforce

- `src/hooks/trip/useDeadReckoning.ts:20` says prior GPS accuracy must be reasonable before fallback.
- `src/hooks/trip/useDeadReckoning.ts:47` creates `lastGoodAccuracyRef`.
- No code actually updates or uses `lastGoodAccuracyRef` before engaging fallback.

Impact:

- The hook documentation and the actual fallback gate do not match.
- That makes the fallback less trustworthy than the comments imply.

### P1. ETA math is visibly heuristic even though richer line data exists

- `src/components/TripProgress.tsx:176` assumes `40km/h = 666 m/min`.
- `src/components/TripProgress.tsx:178` adds `30s per stop`.
- `src/data/stations.ts:95` already stores average commercial speed metadata.
- `src/data/segmentDistances.ts` exists and contains richer segment-level timing geometry.

Impact:

- The UI suggests precision that the current ETA math does not actually have.

### P1. Known issues are real, but the known-issues doc is incomplete

Still-live issues that match the doc:

- CROWD/LIVE echo suppression risk remains in `src/store/useTrainStore.ts:57` through `src/store/useTrainStore.ts:65`.
- Telemetry previous-station derivation still depends on direction inference in `src/utils/telemetryMapper.ts:73` through `src/utils/telemetryMapper.ts:76`.
- Upcoming-trains filter is still bracket-string-based in `src/components/UpcomingTrainsCard.tsx:34` through `src/components/UpcomingTrainsCard.tsx:49` and `src/components/UpcomingTrainsCard.tsx:99` through `src/components/UpcomingTrainsCard.tsx:104`.
- NAV MODE still exits only if `partnerDistMeters <= 30 && gpsAccuracy < 150` in `src/hooks/trip/useTransferLogic.ts:148`.

Important issues missing from the doc:

- `useMaintenanceMode` stale closure
- operating-hours enforcement disabled in `MainApp`
- dead-reckoning accuracy rule not actually enforced
- hardcoded Holy Week dates
- tracked `train-tracks/node_modules`
- hardcoded tokens in test scripts
- permissive `app_config` update policy

### P2. Type debt is already breaking validation

- `tsc_output.txt:1` and `tsc_output.txt:2` show the MRT-7 tab typing mismatch.
- `tsc_output.txt:3` through `tsc_output.txt:8` show current `react-leaflet` typing failures in `MapExplorer.tsx`.
- `tsc_output.txt:9` shows `NotificationOptions` rejecting `vibrate`.
- `src/hooks/useTripNotifications.ts:40` and `src/hooks/useTripNotifications.ts:55` suppress that mismatch with `@ts-ignore` and `as any`.
- Additional unsafe casts exist in `src/components/LineExplorer.tsx:31`, `src/components/LineExplorer.tsx:33`, `src/components/LineExplorer.tsx:66`, `src/app/explorer/page.tsx:63`, `src/components/TripProgress.tsx:412`, and `src/store/useTripStore.ts:256`.

Impact:

- TypeScript is not acting as a design constraint.
- It is acting as noise the build is configured to ignore.

### P2. The repo shape itself is a maintainability problem

- `git ls-files` shows 26,192 tracked files, with 26,000 under `train-tracks/node_modules`.
- `package.json:25`, `package.json:26`, `package.json:41` describe the real app as Next 14 / React 18 / ESLint 8.
- `train-tracks/package.json:6`, `train-tracks/package.json:7`, `train-tracks/package.json:17` describe a nested duplicate environment on Next 16 / React 19 / ESLint 9.
- `README.md` is still near-stock Next boilerplate and does not document the actual application.
- Generated service-worker assets are committed under `public/sw.js` and `public/workbox-f1770938.js`.

Impact:

- The repo does not clearly separate active source, generated output, and legacy duplicate app state.
- That alone increases audit difficulty and future regression risk.

## Cross-Reference Against Existing Docs

### Where the docs are still directionally correct

- `TrainTracks_Known_Issues.md:21` correctly captures the CROWD/LIVE echo class of bug.
- `TrainTracks_Known_Issues.md:66` correctly captures the NAV MODE transfer edge-case family.
- `TrainTracks_Known_Issues.md:83` correctly captures the bracket-filter weakness in `UpcomingTrainsCard`.
- `TrainTracks_Known_Issues.md:110` correctly notes MRT-7 telemetry mapping gaps.

### Where the docs no longer match the code

- `TrainTracks_Project_Documentation.md:14`, `TrainTracks_Project_Documentation.md:294`, and `TrainTracks_Project_Documentation.md:388` describe a route-first, atomic-advance architecture. The current runtime still leaks direct store writes and duplicate progress models.
- `TrainTracks_Project_Documentation.md:358` says `useOperatingHours.ts` represents `4:30 AM – 10:30 PM`, while the current screen copy shows `11:20 PM` and the hook is not even active in `MainApp`.
- `TrainTracks_Project_Documentation.md:515` says `/api/trainsight/trains` proxies to `https://core.trainsight.app/api/data/trains` and injects secrets server-side to avoid token exposure. The current code reads `NEXT_PUBLIC_TRAINSIGHT_*` values and uses `/api/public/trains`.

## Verification Results

Commands run during the third pass:

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Observed results:

- `npm run lint` fails because the ESLint config/runtime pair is mismatched.
- `npx tsc --noEmit` fails with the current MRT-7, Leaflet, and notification typing errors recorded in `tsc_output.txt:1` through `tsc_output.txt:9`.
- `npm run build` succeeds only because `next.config.mjs` skips type and lint enforcement.

## Final Diagnosis

Your “math is busted / tangled / spaghetti” theory is directionally right, but the precise diagnosis is:

- The app has drifted from a single route-state machine into overlapping route, progress, transfer, simulation, and UI calculation layers.
- The docs still describe a cleaner atomic architecture than the one that is actually running.
- Tooling no longer protects the repo from that drift because build-time validation is disabled.

If this is not corrected, the project will keep accumulating bugs that look random at the UI level but actually come from the same structural problem: too many places are allowed to decide where the trip is, how far along it is, and what state it should show.

## Recommended Remediation Order

1. Restore build honesty.
   Turn lint and TypeScript enforcement back into required signals. Fix the ESLint version/config mismatch first.

2. Collapse trip progression into one source of truth.
   Decide whether `advanceToStation()` plus route index is the authority, or whether the app is distance-driven. Right now it is both.

3. Isolate simulation from production state.
   `useSimEngine` should not freely write overlapping trip state if the store contract is supposed to be atomic.

4. Fix the security posture.
   Remove hardcoded secrets and PINs, stop logging token material, and tighten Supabase policy for `app_config`.

5. Reconcile docs with actual behavior.
   Update the project documentation and known-issues doc so they describe the system that exists now, not the cleaner system it used to approximate.

6. Clean the repo itself.
   Remove or quarantine the nested `train-tracks` install and tracked `node_modules`, then re-establish a clear project root.

## Bottom Line

This is not an unsalvageable codebase. It is a codebase whose intended architecture and actual architecture have drifted apart. The problem is recoverable, but only if you stop letting the build lie, reduce the number of state authorities, and treat security and repo hygiene as part of correctness rather than side tasks.
