# EDSA Carousel — Bus Mode

Add EDSA Carousel as a bus-based transit mode to TrainTracks, accessed via a TRAIN/BUS submenu under the Companion toggle. No prediction API, crowd signals, or stall detection — just the full trip experience (origin/dest selection, fare calc, direction, map rendering).

## User Review Required

> [!IMPORTANT]
> **Mode Selector UI** — The Companion toggle currently switches between Companion and Spectator. The plan adds a TRAIN/BUS submenu that appears when Companion is selected. Is this the right interaction model? Should we show it as a small pill toggle, a dropdown, or a slide-up sheet?

> [!IMPORTANT]
> **Fare Model** — EDSA Carousel uses distance-based fares (₱15 base + ₱2.65/km). I'll implement a per-km fare calculator rather than a station-to-station matrix (like rail). Is that acceptable, or do you want a full matrix like the rail lines?

> [!WARNING]
> **Station Coordinates** — I've compiled GPS coordinates from Google Maps and public sources. Some stops (especially curbside ones like City of Dreams, DFA Aseana) may need manual correction. I'll flag uncertain ones in the data file for you to verify.

> [!IMPORTANT]
> **Directional Stops** — EDSA Carousel has a unique property: **Tramo** is Southbound-only, while all other stops serve both directions (but from different platforms/sides of the road). The `Station` type will need a new optional field to represent this. Should we also model the platform side (median vs. curbside) for UI display?

## Open Questions

1. **What color for EDSA Carousel on the map?** Rail lines use green (LRT1), purple (LRT2), yellow (MRT3), red (MRT7). Suggestions: **cyan (#06b6d4)**, **orange (#f97316)**, or **blue (#3b82f6)**?
2. **Bus transfers** — EDSA Carousel stops overlap with MRT3 stations (Taft/EDSA, Ayala, Buendia, Guadalupe, Ortigas, Santolan, Cubao, Kamuning, QAve, North Ave). Should we add transfer data so users can switch between bus and rail mid-trip?
3. **Operating hours** — EDSA Carousel operates 24/7 but with reduced frequency late night. Should we show a "reduced service" indicator or just mark it as always-on?
4. **Line Explorer redesign** — You mentioned the Line Explorer needs to be "tailored more for EDSA Carousel." What specifically? Show bus stop type (median/curbside)? Show direction availability per stop? Show transfer connections to MRT3/LRT1?

---

## Proposed Changes

### Data Layer

#### [NEW] [edsa_carousel.json](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/edsa_carousel.json)
GeoJSON `FeatureCollection` with a `LineString` geometry tracing the EDSA Carousel bus route from Monumento to PITX. Built by hand from known waypoints along the EDSA median busway.

#### [MODIFY] [stations.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/stations.ts)
- Add all 25 EDSA Carousel stops to the `STATIONS` array with `lineId: 'EDSA'`
- Add `EDSA` entry to the `LINES` config object:
  ```ts
  EDSA: {
      name: 'EDSA Carousel',
      color: '#06b6d4', // cyan-500 (TBD)
      type: 'bus',       // NEW: distinguishes from rail
      operatingSpeedKph: 30,
      designSpeedKph: 60,
      avgCommercialSpeedKph: 15, // Traffic-dependent
  }
  ```

**Proposed station list** (North → South, order 1–24):

| # | ID | Name | Lat | Lng | Direction | Transfer |
|---|-----|------|-----|-----|-----------|----------|
| 1 | EC-01 | Monumento | 14.6541 | 120.9839 | BOTH | LRT1 |
| 2 | EC-02 | Bagong Barrio | 14.6573 | 120.9949 | BOTH | — |
| 3 | EC-03 | Balintawak | 14.6573 | 121.0040 | BOTH | LRT1 |
| 4 | EC-04 | Kaingin | 14.6571 | 121.0132 | BOTH | — |
| 5 | EC-05 | Roosevelt (FPJ) | 14.6575 | 121.0212 | BOTH | LRT1 |
| 6 | EC-06 | SM North EDSA | 14.6561 | 121.0286 | BOTH | — |
| 7 | EC-07 | North Avenue | 14.6525 | 121.0322 | BOTH | MRT3 |
| 8 | EC-08 | Philam | 14.6464 | 121.0358 | BOTH | — |
| 9 | EC-09 | Quezon Avenue | 14.6424 | 121.0387 | BOTH | MRT3 |
| 10 | EC-10 | Kamuning | 14.6351 | 121.0434 | BOTH | MRT3 |
| 11 | EC-11 | Nepa Q-Mart | 14.6280 | 121.0476 | BOTH | — |
| 12 | EC-12 | Main Avenue (Cubao) | 14.6194 | 121.0510 | BOTH | MRT3/LRT2 |
| 13 | EC-13 | Santolan | 14.6077 | 121.0564 | BOTH | MRT3 |
| 14 | EC-14 | Ortigas | 14.5879 | 121.0567 | BOTH | MRT3 |
| 15 | EC-15 | Guadalupe | 14.5669 | 121.0455 | BOTH | MRT3 |
| 16 | EC-16 | Buendia | 14.5542 | 121.0341 | BOTH | MRT3 |
| 17 | EC-17 | Ayala (One Ayala) | 14.5489 | 121.0277 | BOTH | MRT3 |
| 18 | EC-18 | Tramo | 14.5418 | 121.0192 | **SB ONLY** | — |
| 19 | EC-19 | Taft Avenue | 14.5375 | 121.0014 | BOTH | MRT3/LRT1 |
| 20 | EC-20 | Roxas Boulevard | 14.5310 | 120.9920 | BOTH | — |
| 21 | EC-21 | SM Mall of Asia | 14.5350 | 120.9830 | BOTH | — |
| 22 | EC-22 | Redemptorist-DFA | 14.5290 | 120.9870 | BOTH | — |
| 23 | EC-23 | City of Dreams | 14.5244 | 120.9820 | BOTH | — |
| 24 | EC-24 | Ayala Aseana | 14.5190 | 120.9850 | BOTH | — |
| 25 | EC-25 | PITX | 14.5085 | 120.9913 | BOTH | LRT1 |

> [!NOTE]
> GPS coordinates are approximate (from Google Maps satellite view of each stop). Will refine during development.

#### [MODIFY] [segmentDistances.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/segmentDistances.ts)
Add `addSegment()` calls for all 23 EDSA Carousel inter-stop segments. Travel times calculated from average bus speed (~15 km/h commercial) + known distances.

#### [NEW] [fareMatrixBus.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/fareMatrixBus.ts)
Distance-based fare calculator for EDSA Carousel:
```ts
export function calculateBusFare(distanceKm: number): { regular: number; discounted: number } {
    const BASE_FARE = 15;    // First 5 km
    const BASE_KM = 5;
    const PER_KM = 2.65;
    const extra = Math.max(0, distanceKm - BASE_KM);
    const regular = Math.ceil(BASE_FARE + extra * PER_KM);
    const discounted = Math.ceil(regular * 0.8); // 20% discount
    return { regular, discounted };
}
```

#### [MODIFY] [transfers.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/data/transfers.ts)
Add bus↔rail transfer entries for the ~10 overlapping stops (Monumento↔LRT1, Taft↔MRT3/LRT1, Ayala↔MRT3, etc.).

---

### Type System

#### [MODIFY] [index.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/types/index.ts)
```diff
-export type LineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7';
+export type LineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7' | 'EDSA';
+export type TransitMode = 'train' | 'bus';

 export interface Station {
     id: string;
     name: string;
     lineId: LineId;
     order: number;
     latitude: number;
     longitude: number;
     transfers?: LineId[];
     isUnderground?: boolean;
+    directionConstraint?: 'NORTHBOUND' | 'SOUTHBOUND'; // Omit = serves both
+    stopType?: 'median' | 'curbside' | 'terminal';     // Bus stop type
 }
```

---

### Domain Logic

#### [MODIFY] [railway.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/railway.ts)
- Add `EDSA` to `TERMINUS_LABELS`: `{ NORTHBOUND: 'Monumento', SOUTHBOUND: 'PITX' }`
- Add `EDSA` handling in `getDirectionForStations()` (same as LRT1: increasing order = SOUTHBOUND)
- Add helper: `getTransitMode(lineId: LineId): TransitMode`
- Update `getNetworkStations()` to include EDSA stations when bus mode is active

#### [MODIFY] [engine.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/engine.ts)
- **No changes to prediction logic** — EDSA is excluded from `LIVE_LINES` and `ALL_PREDICTABLE_LINES`
- Add `LINE_DIRECTIONS` entry for safety: `EDSA: ['SOUTHBOUND', 'NORTHBOUND']`

---

### Store

#### [MODIFY] [useTripStore.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts)
- Add `transitMode: TransitMode` state (`'train'` default)
- Add `setTransitMode(mode: TransitMode)` action
- When `transitMode === 'bus'`, `selectedLine` locks to `'EDSA'`
- Fare calculation switches to `calculateBusFare()` when in bus mode

---

### Map Rendering

#### [MODIFY] [MapExplorer.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/MapExplorer.tsx)
- Import `edsa_carousel.json` and add to `RAIL_LINE_SEGMENTS` (renamed to `LINE_SEGMENTS`)
- Add `EDSA` to `LINE_COLORS` and `LINE_PATH_OPTIONS` (dashed line style to distinguish from rail)
- Update `getVisibleRailLineIds()` to show EDSA when bus mode is active
- Use a **bus icon** instead of train icon for EDSA Carousel station markers

---

### UI Components

#### [MODIFY] [MainApp.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx)
- Under the Companion/Spectator toggle, when COMPANION is active, show a secondary TRAIN/BUS pill toggle
- Switching to BUS filters stations to `lineId: 'EDSA'`, changes the color scheme, and adapts the FareSelector

#### [MODIFY] [FareSelector](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/FareSelector.tsx)
- Detect bus mode from `useTripStore.transitMode`
- Show only EDSA stations in the station picker
- Use distance-based fare display instead of matrix lookup
- Show the directional constraint badge for Tramo (SB only)

#### [MODIFY] [LineExplorer.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/LineExplorer.tsx)
- When `transitMode === 'bus'`, redesign to show:
  - Bus stop list with direction indicators (NB/SB/Both)
  - Stop type badges (Median, Curbside, Terminal)
  - Transfer connection badges (MRT3, LRT1)
  - Distance-based fare from current origin

---

## Verification Plan

### Automated Tests
- `npx next build` — ensure no type errors with expanded `LineId` union
- Verify all existing rail functionality still works (EDSA excluded from prediction engine)

### Manual Verification
- Toggle between TRAIN and BUS modes
- Select EDSA Carousel origin/destination and verify fare calculation
- Verify Tramo shows as SB-only in the station picker
- Verify the bus route renders on the map with correct color and style
- Verify transfer badges appear for overlapping MRT3/LRT1 stops
