# TrainTracks TripLogic and Transfer Rewrite Baseline

Date: 2026-04-11

## Purpose

This document is the reset point for rewriting TrainTracks trip logic, especially transfer handling.

The goal is not to change the product behavior into something else. The goal is to preserve the intended user experience while replacing the current overlapping logic with one clean source of truth.

## Scope Read

For this baseline, I deep-read the trip stack and its direct consumers in `src`, including:

- `src/store/useTripStore.ts`
- `src/hooks/useTripLogic.ts`
- `src/hooks/trip/useStationProgress.ts`
- `src/hooks/trip/useTransferLogic.ts`
- `src/hooks/trip/useRouteAlignment.ts`
- `src/hooks/trip/useDeadReckoning.ts`
- `src/hooks/useSimEngine.ts`
- `src/hooks/useSmartLocation.ts`
- `src/hooks/useWrongDirection.ts`
- `src/hooks/useGpsCrowdsource.ts`
- `src/hooks/useTripNotifications.ts`
- `src/hooks/useStallDetector.ts`
- `src/hooks/useGatekeeper.ts`
- `src/components/MainApp.tsx`
- `src/components/TicketCard.tsx`
- `src/components/TripProgress.tsx`
- `src/components/WrongDirectionAlert.tsx`
- `src/components/GeofenceScanner.tsx`
- `src/components/GPSFallbackHandler.tsx`
- `src/utils/simRoute.ts`
- `src/utils/routeMetrics.ts`
- `src/utils/geo.ts`
- `src/utils/fareNew.ts`
- `src/data/stations.ts`
- `src/data/transfers.ts`
- `src/data/segmentDistances.ts`
- `src/types/index.ts`

I also surveyed the rest of `src` by structure and integration points to confirm where trip state is consumed and where status strings are treated as a public contract.

## The Current System

### What the app is trying to do

The intended behavior is coherent:

1. Detect or choose an origin station.
2. Choose a destination.
3. Compute a route across one or more lines.
4. Track the rider through same-line travel and transfer walks.
5. Show a polished rider-facing state:
   - current station
   - next station
   - progress
   - distance to next and destination
   - transfer guidance
   - wrong-direction warnings
   - crowdsource telemetry
   - notifications

That intended behavior is valid. The problem is how the current code implements it.

### Where the current truth lives

The current trip truth is split across multiple layers:

- `useTripStore.ts`
  - owns trip-level state like `origin`, `destination`, `currentStation`, `nextStation`, `status`, `direction`, `computedRoute`, `routeIndex`
  - contains `advanceToStation()` and route recomputation

- `useStationProgress.ts`
  - interprets GPS and speed
  - decides `statusText`
  - decides `displayStation`
  - computes `legProgress`, `totalProgress`, `distanceToNext`, `distanceToDest`
  - can also call `advanceToStation()` and `setStatus()`

- `useTransferLogic.ts`
  - decides whether transfer NAV MODE should begin
  - manages `walkingDistance`
  - can also call `advanceToStation()` and `setStatus('WAITING')`

- `useRouteAlignment.ts`
  - snaps the rider to a nearby station on the route during recovery cases
  - can also call `advanceToStation()`

- `useDeadReckoning.ts`
  - simulates movement when GPS goes silent
  - can also call `advanceToStation()`

- `useSimEngine.ts`
  - is another movement model for simulation/dev flows
  - also coordinates with transfer logic and station advancement

- `useTripLogic.ts`
  - is not the single engine
  - it is an orchestrator over the engines above

This is the core architectural issue.

## What Is Wrong

### 1. There is no single state machine

The app behaves as if there is one journey engine, but there is not.

Instead, the rider can be moved forward by:

- station progress
- transfer completion
- route snap recovery
- dead reckoning
- simulation

All of them touch the same trip position state.

That means the app can appear stable most of the time while still being mathematically fragile.

### 2. Domain truth and UI truth are mixed together

The current code does not cleanly separate:

- where the rider actually is on the route
- what station the UI should display
- what text label the rider should see
- what progress bar should animate

`displayStation` and `statusText` are presentation concepts, but they currently influence control flow. That is backwards.

### 3. Transfer logic is coupled to station status text

`useTransferLogic.ts` only enters NAV MODE when:

- the current station is a transfer station, and
- `baseStatusText === 'CURRENT STATION'`

That means transfer behavior is not driven by an explicit route phase like "you are now on a transfer-walk edge." It is driven by a UI-facing state label from another hook.

That is one of the clearest signs the logic needs a base-zero rewrite.

### 4. Route topology is split across multiple files with different responsibilities

Current route knowledge is split like this:

- `simRoute.ts`
  - route topology
  - line-to-line transfer pairing

- `segmentDistances.ts`
  - same-line track distances and travel times

- `transfers.ts`
  - walking instructions and transfer distances

- `stations.ts`
  - station registry and loose transfer hints

This means the app does not have one route graph. It has partial route information spread across several modules.

### 5. Status strings are now a hidden app-wide API

The strings:

- `CURRENT STATION`
- `NOW LEAVING`
- `NOW APPROACHING`
- `IN TRANSIT`
- `TRANSFER TO ...`

are not just display text.

They are consumed by:

- transfer logic
- notifications
- crowdsource reporting
- trip cards
- progress cards
- live train display mapping

That makes refactoring fragile, because changing wording can silently change behavior.

### 6. Direction is overloaded

The current app mixes at least three different meanings of direction:

- route direction along the planned journey
- train travel direction on a line
- device heading / compass heading

This shows up in `useSmartLocation.ts`, `useWrongDirection.ts`, and trip consumers. The app gets away with it, but the abstractions are blurry.

### 7. Transfer completion is not modeled as first-class route progress

A transfer should be an edge in the route graph with:

- start node
- end node
- type = transfer
- distance
- expected behavior
- completion threshold

Right now transfer completion is treated as a special overlay on top of line travel.

### 8. Recovery logic is valid, but it is bolted onto the side

Late entry, stale GPS, recovery snap, and dead reckoning are all reasonable product needs.

The problem is that they currently modify trip progression from outside the main flow instead of feeding one engine.

## What Is Still Good

Not everything should be thrown away.

### Keep these ideas

- `computedRoute` and `routeIndex` as a route-first concept
- `advanceToStation()` as an atomic progression idea
- `segmentDistances.ts` as the rail edge timing dataset
- `transfers.ts` as the source for transfer instruction content
- `routeMetrics.ts` as a clean distance/progress derivation utility
- `useSmartLocation.ts` as the GPS/sim input source

### The current UX contract is worth preserving

The rewrite should preserve:

- origin scanning and manual station setting
- destination selection
- same-line trip tracking
- transfer NAV MODE
- progress bar behavior
- distance and ETA presentation
- notifications
- wrong-direction warning
- crowdsource reporting

The rewrite should change the engine, not the product identity.

## Clean Rewrite Direction

## Principle 1: One route graph

Replace the current split topology with one normalized graph model.

### Proposed domain model

- `JourneyNode`
  - station node

- `JourneyEdge`
  - `type: 'rail' | 'transfer'`
  - `fromStationId`
  - `toStationId`
  - `lineId`
  - `distanceMeters`
  - `travelTimeSec`
  - `transferInstruction?`
  - `targetCoordinates?`

- `JourneyRoute`
  - ordered list of nodes and edges from origin to destination

This graph should be built from:

- `stations.ts`
- `segmentDistances.ts`
- `transfers.ts`

not from multiple competing route definitions.

## Principle 2: One engine

Create a pure journey engine that owns route progression.

### Proposed engine state

- `phase`
  - `IDLE`
  - `WAITING_AT_ORIGIN`
  - `ONBOARD_DWELL`
  - `ONBOARD_MOVING`
  - `TRANSFER_WALK`
  - `TRANSFER_WAIT`
  - `ARRIVED`

- `route`
- `activeEdgeIndex`
- `currentNodeId`
- `targetNodeId`
- `edgeProgress`
- `lastReliableLocation`
- `recoveryMode`

### Proposed engine inputs

- GPS samples
- speed
- heading
- simulated movement samples
- manual origin updates
- route recovery events

### Proposed engine outputs

- domain truth
  - current node
  - target node
  - current edge
  - phase
  - progress

- presentation model
  - display station
  - status code
  - status label
  - distance to next
  - distance to destination
  - stops remaining
  - transfer prompt

The engine should be pure and deterministic. React hooks should adapt to it, not contain the business logic themselves.

## Principle 3: Separate domain state from UI text

Instead of making control flow depend on strings, define internal enums.

### Example internal status

- `AT_STATION`
- `LEAVING_STATION`
- `BETWEEN_STATIONS`
- `APPROACHING_STATION`
- `TRANSFER_ACTIVE`
- `WAITING_AFTER_TRANSFER`
- `ARRIVED`

Then add one adapter that maps those statuses to the current UI labels:

- `AT_STATION` -> `CURRENT STATION`
- `LEAVING_STATION` -> `NOW LEAVING`
- `BETWEEN_STATIONS` -> `IN TRANSIT`
- `APPROACHING_STATION` -> `NOW APPROACHING`
- `TRANSFER_ACTIVE` -> `TRANSFER TO ...`

That preserves the UI contract without making strings part of the engine.

## Principle 4: Transfer is an edge, not a side effect

This is the most important change.

In the rewrite:

- a transfer route segment is just another edge in the route
- the engine knows when the active edge is a transfer edge
- NAV MODE starts because the active edge changed to `transfer`
- completion happens because the transfer edge progress reached its threshold
- no transfer state depends on `CURRENT STATION` text

This is the right model.

## Principle 5: Recovery feeds the engine, it does not mutate around it

Late-entry snap, GPS recovery, and dead reckoning should not directly advance the store.

Instead they should emit an input like:

- `ROUTE_POSITION_RECOVERED`
- `GPS_STALE`
- `GPS_RECOVERED`
- `SNAP_TO_NODE`

and the engine decides how the route cursor changes.

## Proposed State Machine

### Normal same-line travel

1. `WAITING_AT_ORIGIN`
2. `ONBOARD_DWELL`
3. `LEAVING_STATION`
4. `BETWEEN_STATIONS`
5. `APPROACHING_STATION`
6. `ONBOARD_DWELL`
7. repeat until destination

### Transfer travel

1. arrive at transfer station
2. next route edge is `transfer`
3. enter `TRANSFER_WALK`
4. show NAV MODE using edge metadata
5. when transfer edge threshold reached, enter partner station
6. move to `TRANSFER_WAIT`
7. next rail edge begins

### Recovery

1. GPS goes stale
2. engine enters recovery mode
3. dead reckoning may supply temporary progress samples
4. GPS returns and route position is recovered
5. engine reconciles active edge and node

## What We Must Preserve During Rewrite

These are non-negotiable behavior requirements:

### Same-line trip behavior

- current station logic must still feel stable
- approach and leaving windows must still feel human, not robotic
- progress bar must remain smooth

### Transfer experience

- user must still get a transfer station handoff
- walk distance must still be shown
- instructions must still come from the transfer data
- partner station completion must feel deliberate, not jittery

### Edge-case handling

- late entry must still work
- GPS recovery must still work
- simulated mode must still work
- wrong-direction warnings must still have enough data to work
- notifications and crowdsource formatting must still work

## Recommended Rewrite Strategy

### Phase 0: Freeze current external behavior

Before replacing logic, define invariants:

- the route from origin to destination must be deterministic
- same-line and transfer routes must be reproducible
- arrival at a transfer station must always lead to the correct partner edge
- total progress must never move backward unless recovery explicitly says so
- `statusText` mapping must remain consistent for the UI

### Phase 1: Build a normalized route graph

Create a new trip domain layer, for example:

- `src/domain/journey/graph.ts`
- `src/domain/journey/routeBuilder.ts`
- `src/domain/journey/types.ts`

This should replace hardcoded pair-wiring as the canonical source of route math.

### Phase 2: Build a pure journey engine

Create something like:

- `src/domain/journey/engine.ts`
- `src/domain/journey/reducer.ts`

This engine should accept inputs and emit next state with no React dependencies.

### Phase 3: Build adapters

Create adapters for:

- UI status strings
- display station
- progress metrics
- notifications
- crowdsource telemetry

### Phase 4: Put the new engine behind `useTripLogic`

Keep the outer app interface stable first.

That means `MainApp.tsx`, `TicketCard.tsx`, and `TripProgress.tsx` can keep their current prop contract while the underlying engine changes.

### Phase 5: Remove old mutation paths

Delete or collapse:

- direct advancement from `useStationProgress`
- transfer advancement from `useTransferLogic`
- route advancement from `useRouteAlignment`
- route advancement from `useDeadReckoning`

Those modules should become signal producers, not state owners.

## What I Would Rewrite First

If we start now, the order should be:

1. Route graph foundation
2. Transfer edge model
3. Pure journey state machine
4. Adapter layer that reproduces current `statusText` outputs
5. Migration of `useTripLogic`
6. Removal of old overlapping advancement code

## Bottom Line

Your theory is directionally correct.

The main problem is not one bad transfer formula. The main problem is that the trip system is currently made of several small engines pretending to be one engine.

The correct rewrite is:

- one route graph
- one journey engine
- one authoritative route cursor
- transfer as a first-class edge
- presentation derived from domain truth

That is how we reset to base zero without losing the TrainTracks behavior the app is trying to achieve.
