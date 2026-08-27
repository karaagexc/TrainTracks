# EDSA Carousel — Bus Mode (Revised)

Add EDSA Carousel as a typed multimodal bus transit feature. Full bus trip support, verified stop/fare data, map rendering, and bus-to-rail transfers. Prediction API, crowd broadcasts, stall reports, rush-hour logic, and train markers remain **rail-only**.

---

## Proposed Changes

### Type System

#### [MODIFY] [index.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/types/index.ts)

```diff
-export type LineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7';
-export type BuiltLineId = Exclude<LineId, 'MRT7'>;
+export type LineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7' | 'EDSA';
+export type RailLineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7';
+export type BuiltRailLineId = Exclude<RailLineId, 'MRT7'>;
+export type BuiltLineId = BuiltRailLineId; // Back-compat alias
+export type TransitMode = 'train' | 'bus';
+export type LineKind = 'rail' | 'bus';

 export interface Station {
     id: string;
     name: string;
     lineId: LineId;
     order: number;
     latitude: number;
     longitude: number;
     transfers?: LineId[];
     isUnderground?: boolean;
+    // Bus stop metadata (optional, only for bus lines)
+    directionAvailability?: 'both' | 'northbound_only' | 'southbound_only';
+    stopType?: 'median' | 'curbside' | 'terminal' | 'concourse';
+    platformNotes?: string;          // e.g. "Northbound platform via footbridge"
+    landmarkAliases?: string[];      // e.g. ["One Ayala", "Ayala Triangle"]
+    verificationStatus?: 'verified' | 'approximate' | 'unverified';
 }
```

Add a `isRailLine()` type guard and `getLineKind()` helper:
```ts
export function isRailLine(lineId: LineId): lineId is RailLineId {
    return lineId !== 'EDSA';
}
export function getLineKind(lineId: LineId): LineKind {
    return lineId === 'EDSA' ? 'bus' : 'rail';
}
```

---

### Data Layer

#### [NEW] [edsa_carousel.json](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/edsa_carousel.json)
GeoJSON `FeatureCollection` with `LineString` geometry tracing the EDSA Carousel bus route from Monumento to PITX along the median busway. Waypoints derived from the EDSA median lane centerline.

#### [NEW] [edsaStops.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/edsaStops.ts)
Dedicated EDSA data module with source manifest. Contains:
- `EDSA_STOPS: Station[]` — 24 operational stops with coordinates, direction availability, stop type, transfer links, verification status
- `EDSA_SOURCE_MANIFEST` — Citation metadata for each coordinate/stop with source URL, date accessed, verification method

**24 operational stops (North → South):**

| # | ID | Name | Dir | Stop Type | Transfer | Verification |
|---|-----|------|-----|-----------|----------|-------------|
| 1 | EC-01 | Monumento | both | terminal | LRT1 | verified |
| 2 | EC-02 | Bagong Barrio | both | median | — | approximate |
| 3 | EC-03 | Balintawak | both | median | LRT1 | verified |
| 4 | EC-04 | Kaingin | both | median | — | approximate |
| 5 | EC-05 | Roosevelt (FPJ) | both | median | LRT1 | verified |
| 6 | EC-06 | SM North EDSA | both | concourse | — | verified¹ |
| 7 | EC-07 | North Avenue | both | median | MRT3 | verified |
| 8 | EC-08 | Philam | both | median | — | approximate |
| 9 | EC-09 | Quezon Avenue | both | median | MRT3 | verified |
| 10 | EC-10 | Kamuning | both | median | MRT3 | verified |
| 11 | EC-11 | Nepa Q-Mart | both | median | — | approximate |
| 12 | EC-12 | Main Avenue (Cubao) | both | median | MRT3/LRT2 | verified |
| 13 | EC-13 | Santolan | both | median | MRT3 | verified |
| 14 | EC-14 | Ortigas | both | median | MRT3 | verified |
| 15 | EC-15 | Guadalupe | both | median | MRT3 | verified |
| 16 | EC-16 | Buendia | both | median | MRT3 | verified |
| 17 | EC-17 | Ayala (One Ayala) | both | curbside | MRT3 | verified |
| 18 | EC-18 | Tramo | **sb_only** | median | — | verified |
| 19 | EC-19 | Taft Avenue | both | median | MRT3/LRT1 | verified |
| 20 | EC-20 | Roxas Boulevard | both | median | — | approximate |
| 21 | EC-21 | SM Mall of Asia | both | curbside | — | verified² |
| 22 | EC-22 | Redemptorist-DFA | both | median | — | approximate |
| 23 | EC-23 | City of Dreams | both | curbside | — | approximate |
| 24 | EC-24 | PITX | both | terminal | LRT1 | verified |

> [!NOTE]
> ¹ SM North EDSA Busway Concourse opened March 13, 2025 — [GMA source](https://www.gmanetwork.com/news/topstories/metro/939171/sm-north-edsa-busway-concourse-opens-to-the-public/story/)
> ² SM MOA NB stop planned Oct 1, 2025 — [Philstar source](https://www.philstar.com/nation/2025/09/17/2473512/edsa-busway-expands-new-stop-moa)

> [!IMPORTANT]
> Stops marked `approximate` need ground-truth verification. They are selectable but displayed with a subtle indicator. Stops marked `unverified` would be excluded from the picker entirely (none in this list currently).

---

#### [MODIFY] [stations.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/stations.ts)
- Import and spread `EDSA_STOPS` into `STATIONS` array
- Add `EDSA` entry to `LINES` config:
```ts
EDSA: {
    name: 'EDSA Carousel',
    color: '#06b6d4',        // cyan-500
    kind: 'bus',             // NEW field
    operatingSpeedKph: 60,
    designSpeedKph: 60,
    avgCommercialSpeedKph: 15,
}
```

#### [MODIFY] [segmentDistances.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/segmentDistances.ts)
Add `addSegment()` calls for all 23 EDSA inter-stop segments. Distances from Haversine of verified coordinates; travel times from avg 15 km/h commercial speed.

#### [NEW] [fareMatrixBus.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/fareMatrixBus.ts)
LTFRB fare-matrix model ([GMA source](https://www.gmanetwork.com/news/topstories/metro/855955/ltfrb-releases-fare-matrix-as-edsa-bus-carousel-libreng-sakay-ends-on-jan-1/story/)):
```ts
export function calculateBusFare(distanceKm: number): {
    regular: number;
    discounted: number;  // 20% off for students/seniors/PWD
} {
    const BASE_FARE = 15;
    const BASE_KM = 5;
    const PER_KM = 2.65;
    const extra = Math.max(0, distanceKm - BASE_KM);
    const regular = Math.ceil(BASE_FARE + extra * PER_KM);
    const discounted = Math.ceil(regular * 0.8);
    return { regular, discounted };
}
```

#### [MODIFY] [transfers.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/transfers.ts)
Add bus↔rail transfer entries for verified interchange pairs:
- Monumento (EC-01 ↔ L1-18)
- Balintawak (EC-03 ↔ L1-19)
- Roosevelt/FPJ (EC-05 ↔ L1-20)
- North Avenue (EC-07 ↔ M3-01)
- Quezon Avenue (EC-09 ↔ M3-02)
- Kamuning (EC-10 ↔ M3-03)
- Main Ave/Cubao (EC-12 ↔ M3-04, L2-08)
- Santolan (EC-13 ↔ M3-05)
- Ortigas (EC-14 ↔ M3-06)
- Guadalupe (EC-15 ↔ M3-09)
- Buendia (EC-16 ↔ M3-10)
- Ayala (EC-17 ↔ M3-11)
- Taft Avenue (EC-19 ↔ M3-13, L1-02)
- PITX (EC-24 ↔ L1-23)

Each with explicit `walkTimeMin`, `distanceMeters`, `routeType`, and `direction`.

---

### Domain Logic — Rail Guard Rails

#### [MODIFY] [railway.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/railway.ts)
- Add `EDSA` to `TERMINUS_LABELS`: `{ NORTHBOUND: 'Monumento', SOUTHBOUND: 'PITX' }`
- Add `EDSA` handling in `getDirectionForStations()` (increasing order = SOUTHBOUND, same as LRT1)
- Add `getTransitMode(lineId): TransitMode` helper
- Update `getNetworkStations()` to accept a `transitMode` filter parameter
- `getNetworkStations('train', ...)` excludes EDSA; `getNetworkStations('bus', ...)` returns only EDSA

#### [MODIFY] [engine.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/engine.ts)
- `LIVE_LINES` and `ALL_PREDICTABLE_LINES` stay as `RailLineId[]` — EDSA never enters
- Add `LINE_DIRECTIONS` entry for type safety: `EDSA: ['SOUTHBOUND', 'NORTHBOUND']`
- No prediction logic changes

#### [NO CHANGE] Crowd/Stall/Incident Systems
- `stallReport.ts`, `stallBroadcast.ts`, `incidentAggregator.ts`, `presence.ts` — all already typed to rail lines
- Add `isRailLine()` guards at API route entry points as defense-in-depth:
  - `POST /api/public/stall-report` → reject `lineId: 'EDSA'`
  - `POST /api/crowd/presence` → reject `lineId: 'EDSA'`

#### [NO CHANGE] Congestion / Rush Hour
- `congestion.ts`, `congestionProfiles.ts` — rail-only data, no EDSA profiles
- `GET /api/public/congestion` and `GET /api/public/rush-hour` → EDSA returns empty/N/A

---

### Store

#### [MODIFY] [useTripStore.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts)
- Add `transitMode: TransitMode` state (default `'train'`)
- Add `setTransitMode(mode: TransitMode)` action
- When `transitMode === 'bus'`: `selectedLine` locks to `'EDSA'`
- When `transitMode === 'train'`: `selectedLine` excludes `'EDSA'`
- Fare calculation dispatches to `calculateBusFare()` when `transitMode === 'bus'`
- Trip history logs `transitMode` and `lineKind` alongside existing fields

---

### Map Rendering

#### [MODIFY] [MapExplorer.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/MapExplorer.tsx)
- Import `edsa_carousel.json`, add to line segments lookup
- Add `EDSA` to `LINE_COLORS` (`#06b6d4`) and `LINE_PATH_OPTIONS` with **dashed** stroke to distinguish from rail
- When `transitMode === 'bus'`: show EDSA route + bus stop markers (bus icon, not train icon)
- Rail lines remain visible in bus mode **only** at transfer stops (for context)
- Bus stops with `directionAvailability !== 'both'` get a direction indicator arrow on the marker
- Stops with `verificationStatus === 'approximate'` get a subtle dashed border on their marker

#### [NO CHANGE] [LiveTrainLayer.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/LiveTrainLayer.tsx)
- Already filtered to rail predictions — EDSA trains never appear

---

### UI Components

#### [MODIFY] [MainApp.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx)
- Under the Companion/Spectator toggle, when COMPANION is active, show a secondary **TRAIN / BUS** pill toggle
- Spectator mode remains unchanged (rail-only spectator for now)
- Switching to BUS calls `setTransitMode('bus')`, filters all station UI to EDSA stops
- Switching to TRAIN calls `setTransitMode('train')`, restores rail behavior

#### [MODIFY] [FareSelector.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/FareSelector.tsx)
- Detect `transitMode` from store
- In bus mode: show only EDSA stops, display distance-based fare estimate, show direction constraint badges
- Tramo (SB only) is selectable only as a valid stop for that direction
- Transfer badges shown for stops with rail interchange

#### [MODIFY] [LineExplorer.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/LineExplorer.tsx)
- When `transitMode === 'bus'`: adapt existing card/modal surfaces to show EDSA stop details
  - Direction availability badges (NB/SB/Both)
  - Stop type indicator (Median, Curbside, Terminal, Concourse)
  - Transfer connection badges (MRT3, LRT1, LRT2)
  - Distance-based fare from current origin
- No full redesign — same component language, different data

#### [MODIFY] [TicketCard.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/TicketCard.tsx)
- Show bus icon instead of train icon when `transitMode === 'bus'`
- Use EDSA Carousel branding color (cyan)
- Show "BUS" mode indicator badge

---

## Verification Plan

### Type & Filtering
- Rail-only systems (`predictions`, `crowd`, `stall`, `incidents`, `congestion`) reject or ignore `lineId: 'EDSA'`
- `isRailLine()` guard returns `false` for `'EDSA'`
- Bus mode station pickers show only EDSA stops
- Train mode does not show EDSA stops unless transfer context requires it

### Routing
- EDSA direct trips route NB/SB correctly
- Tramo selectable only in SB direction
- Bus-to-rail transfers work at verified interchange pairs
- Rail-only routes remain unchanged

### Fares
- `calculateBusFare(distanceKm)` matches LTFRB source-backed samples:
  - 5 km → ₱15 regular / ₱12 discounted
  - 10 km → ₱29 regular / ₱24 discounted
  - 25 km (end-to-end) → ₱69 regular / ₱56 discounted
- Rail fare matrix still returns existing fares unchanged

### Map/UI
- TRAIN/BUS sub-pill switches station sets without breaking Companion/Spectator
- EDSA route renders as dashed cyan polyline
- Bus stop markers use bus icon, not train icon
- Existing station history, recent trips, and fare selector still work in train mode

### Verification Commands
```bash
npx tsc --noEmit --pretty false --incremental false
npx next build
```
