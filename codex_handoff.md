# TrainTracks — Codex Handoff

## Project Overview

**TrainTracks** is a Philippine metro rail (LRT-1, LRT-2, MRT-3) progressive web app built with **Next.js 14** (App Router) + **TypeScript** + **Supabase** (auth, Realtime, Postgres). It tracks user GPS to detect train journeys, predict crowding, and provide real-time alerts. Deployed on **Vercel**.

**Repo root**: `c:\Users\Exelec\Downloads\TrainTracks`

---

## What Has Already Been Built (Completed ✅)

### Phase 1: API Console & Documentation System

A full admin-gated API management console and public documentation site was built:

| File | Purpose |
|---|---|
| [page.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/api-console/page.tsx) | Auth gate for API console (Google OAuth → `is_admin` check) |
| [page.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/docs/page.tsx) | Standalone docs route |
| [ApiConsole.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/ApiConsole.tsx) | Main console component — **6 tabs**: Live Stats, API Tokens, Playground, CLI Polling, Config, Docs |
| [ApiDocs.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/ApiDocs.tsx) | Full API documentation component (~60KB, comprehensive) |
| [ApiConfirmModal.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/ApiConfirmModal.tsx) | Reusable cautious confirmation modal for destructive actions |

### Phase 2: API Migration (Stall + Rush Hour + Congestion)

Four new public API endpoints were created and documented:

| Endpoint | Route File | Purpose |
|---|---|---|
| `GET /api/public/congestion` | [route.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/api/public/congestion/route.ts) | Congestion snapshot by station |
| `GET /api/public/rush-hour` | [route.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/api/public/rush-hour/route.ts) | Current time window classification |
| `GET /api/public/stall-config` | [route.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/api/public/stall-config/route.ts) | Stall detection thresholds (read-only config) |
| `POST /api/public/stall-report` | [route.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/app/api/public/stall-report/route.ts) | Crowdsourced stall signal submission + Supabase Realtime broadcast |

### Phase 2 Domain Layer (New Files):

| File | Purpose |
|---|---|
| [stallReport.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/crowd/stallReport.ts) | Stall report validation & sanitization with full anti-abuse measures (rate limiting, geo-fencing, service hours, proximity check, device hashing) |
| [stallBroadcast.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/crowd/stallBroadcast.ts) | Supabase Realtime broadcast for stall signals via `traintracks:stall-reports` channel |

### Existing Domain Layer (Pre-existing, relevant context):

| File | Purpose |
|---|---|
| [broadcast.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/crowd/broadcast.ts) | GPS crowdsource broadcast (for train presence) |
| [presence.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/crowd/presence.ts) | Crowd presence tracking |
| [constants.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/domain/crowd/constants.ts) | Crowd signal constants |

### Key Existing Hooks (Client-Side):

| Hook | Purpose |
|---|---|
| [useStallDetector.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useStallDetector.ts) | Client-side stall detection (GPS-based, triggers after ~7 min of no movement) |
| [useGpsCrowdsource.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useGpsCrowdsource.ts) | GPS crowdsource broadcasting for train presence |
| [useCongestionAlert.ts](file:///c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useCongestionAlert.ts) | Congestion alert logic |

### Key Existing Components:

| Component | Purpose |
|---|---|
| [StallAlert.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/StallAlert.tsx) | Current stall alert UI (bottom sheet, severity picker: "Just Slow Traffic" vs "Emergency Stop") |
| [CongestionAlert.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/CongestionAlert.tsx) | Congestion alert banner |
| [MainApp.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx) | Main app shell (~52KB, orchestrates all components) |

---

## What Needs To Be Fixed / Known Issues

1. **Some text in Config tab and API Docs had mojibake** (encoding issues with special characters) — this was partially fixed but verify no remaining issues in [ApiConsole.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/ApiConsole.tsx) and [ApiDocs.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/ApiDocs.tsx).

2. **CongestionAlert close button** had a rendering bug where an "A" character was showing — check [CongestionAlert.tsx](file:///c:/Users/Exelec/Downloads/TrainTracks/src/components/CongestionAlert.tsx) line ~141 area to verify the fix is clean.

3. **Empty route scaffolds exist** but have no `route.ts` files inside:
   - `src/app/api/public/incidents/manual/` — empty
   - `src/app/api/public/incidents/resolve/` — empty

---

## What Needs To Be Built (Approved Implementation Plan)

> [!IMPORTANT]
> The implementation plan below was **approved by the user**. It is the next major feature to build.

### Crowdsourced Stall Incident System

The current stall detection is **solo** — each phone detects its own stall and asks the user to classify it. There's no line-wide broadcast, no moderation, no incident lifecycle. The plan adds a full **incident pipeline** with crowdsourced signals, quorum-based confirmation, line-wide PSAs, and automatic resolution.

### Architecture: Incident Lifecycle

```
Client detects stall (7 min)
    → User classifies severity
    → POST /api/public/stall-report (with new `reason` + `message` fields)
    → Server: Incident Aggregator
        → < 3 reports: PENDING (raw signal broadcast only)
        → ≥ 3 reports in 10min from unique devices: CONFIRMED → create incident
            → Broadcast PSA on `traintracks:incidents` channel
            → All clients on affected line show PSA banner
            → New reports refresh TTL
            → 30 min no reports → AUTO-RESOLVED
            → 3 "resolved" votes → USER-RESOLVED
            → Broadcast RESOLVED on incidents channel
```

### Files to Create

#### 1. `src/domain/crowd/incidentAggregator.ts` — **[NEW]**

The core engine. In-memory store that:
- **Receives** stall reports from the API route
- **Clusters** reports by line + geo proximity (within 2km of each other)
- **Promotes** to `CONFIRMED` when quorum is met (3 unique devices, 10 min window)
- **Tracks** incident lifecycle: `PENDING → CONFIRMED → RESOLVED`
- **Auto-expires** incidents after 30 min with no new reports
- **Merges** overlapping incidents on the same line

Key types:
```typescript
type IncidentStatus = 'PENDING' | 'CONFIRMED' | 'RESOLVED';
type StallReason = 'slow_traffic' | 'full_stop' | 'door_issue' | 'medical_emergency' | 'power_outage' | 'signal_fault' | 'crowd_surge' | 'unknown';

interface Incident {
    id: string;                          // INC-{lineId}-{timestamp}
    lineId: LineId;
    status: IncidentStatus;
    severity: 'traffic' | 'emergency';
    reason: StallReason;
    nearestStationId: string;
    nearestStationName: string;
    lat: number; lng: number;            // Centroid of reports
    reportCount: number;
    uniqueDevices: Set<string>;
    firstReportedAt: number;
    lastReportedAt: number;
    confirmedAt: number | null;
    resolvedAt: number | null;
    resolvedBy: 'auto_expired' | 'user_vote' | 'admin' | null;
    ttlMs: number;                       // 30 min default
    resolveVotes: Set<string>;
}

const INCIDENT_CONFIG = {
    quorumDevices: 3,          // Unique devices to confirm
    quorumWindowMs: 600_000,   // 10 minutes
    clusterRadiusKm: 2.0,     // Reports within 2km = same incident
    ttlMs: 1_800_000,         // 30 min auto-expire
    resolveQuorum: 3,          // 3 "resolved" votes to close
    maxActivePerLine: 3,       // Prevent flood
};
```

#### 2. `src/app/api/public/incidents/route.ts` — **[NEW]**

`GET /api/public/incidents?line=LRT1` — Returns active incidents for a line (or all lines). Public, token-gated.

#### 3. `src/app/api/public/incidents/resolve/route.ts` — **[NEW]**

`POST /api/public/incidents/resolve` — Allows users to vote that the incident is resolved. When `resolveQuorum` (3) is met, incident moves to `RESOLVED`.

#### 4. `src/components/ServiceDisruptionBanner.tsx` — **[NEW]**

A persistent **top-of-screen banner** (not a bottom sheet) showing confirmed incidents on user's active line:
- **Red banner** for `emergency` severity
- **Amber banner** for `traffic` severity
- Sticky at top, below header
- Shows: incident description, station, report count, time since confirmed
- "Trains moving again?" button → calls resolve endpoint
- Auto-hides when incident is resolved (via Realtime)

#### 5. `src/hooks/useIncidentListener.ts` — **[NEW]**

Hook that:
1. Subscribes to `traintracks:incidents` Supabase Realtime channel
2. Filters incidents by user's `selectedLine` from trip store
3. Returns active incidents for the current line
4. Handles confirmed/updated/resolved events

### Files to Modify

#### 6. `src/app/api/public/stall-report/route.ts` — **[MODIFY]**

After broadcast, also **feed the report into the IncidentAggregator**. If quorum is met, broadcast a PSA on the `traintracks:incidents` channel.

Add fields to stall report payload:
- `reason`: `slow_traffic | full_stop | door_issue | medical_emergency | power_outage | signal_fault | crowd_surge | unknown`
- `message` (optional): Free-text user note, max 200 chars, sanitized

#### 7. `src/components/StallAlert.tsx` — **[MODIFY]**

Add **reason picker** between the severity buttons (grid of reason icons: 🐌 Slow Traffic, 🛑 Full Stop, 🚪 Door Issue, 🏥 Medical Emergency, ⚡ Power Outage, ❓ IDK).

#### 8. `src/hooks/useStallDetector.ts` — **[MODIFY]**

After user confirms severity, auto-POST to `/api/public/stall-report` with GPS location, severity, reason.

#### 9. `src/components/ApiConsole.tsx` — **[MODIFY]**

- **Config tab**: Add "Incident Aggregator" section with quorum, TTL, cluster radius, resolve quorum settings.
- **Live Stats tab**: Add "Active Incidents" card showing current confirmed incidents across all lines.

#### 10. `src/components/ApiDocs.tsx` — **[MODIFY]**

Add documentation for:
- `GET /api/public/incidents`
- `POST /api/public/incidents/resolve`
- Updated `POST /api/public/stall-report` (new `reason` + `message` fields)

### Broadcast Channel Design

**Channel**: `traintracks:incidents`

| Event | When | Payload |
|-------|------|---------|
| `incident_confirmed` | Quorum met → new incident confirmed | Full incident object + PSA text |
| `incident_updated` | New reports on existing incident | Updated incident (report count, severity upgrade) |
| `incident_resolved` | TTL expired or user-voted resolved | Incident ID + resolution reason |

**Scope**: Line-wide. Every client subscribed to `traintracks:incidents` receives all incidents. Client-side filtering by `lineId` matches the user's current trip line.

### Anti-Abuse Layers

| Layer | Protection |
|-------|-----------|
| **Rate limiting** | 5 min cooldown per device, 6/hour cap |
| **Geo-fence** | Metro Manila bounds + 1.5km from nearest station |
| **Quorum** | 3 unique devices must independently report before PSA fires |
| **Proximity clustering** | Reports must be within 2km of each other to count as same incident |
| **TTL auto-expire** | 30 min with no fresh reports → auto-resolved |
| **Service hours** | No reports during closed hours (23:00–04:30) |
| **Device hashing** | Privacy-first — device IDs hashed, no PII stored |
| **Resolve voting** | 3 users can vote "resolved" to clear false alarms |
| **Per-line cap** | Max 3 active incidents per line (prevents flood) |

### Important Caveats

> [!WARNING]
> **No persistent storage**: This uses in-memory incident state on the server. If the Vercel serverless function cold-starts, active incidents are lost. For production persistence, Supabase DB or KV store would be needed — but that's out of scope for this iteration. The user accepted this tradeoff.

---

## Tech Stack Reference

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Auth**: Supabase Auth (Google OAuth + email/password)
- **Realtime**: Supabase Realtime (broadcast channels)
- **DB**: Supabase Postgres
- **State**: Zustand stores (`useTripStore`, etc.)
- **Styling**: Vanilla CSS (no Tailwind)
- **Deployment**: Vercel
- **API Auth**: Bearer token / X-API-Key / query param (`?key=`)

## Key Directories

```
src/
├── app/
│   ├── api/
│   │   └── public/           # Public API routes (token-gated)
│   │       ├── congestion/   # GET congestion snapshot
│   │       ├── crowd/presence/# Crowd presence
│   │       ├── incidents/    # Incident endpoints (scaffolded, needs route.ts files)
│   │       │   ├── manual/   # Empty — needs route.ts
│   │       │   └── resolve/  # Empty — needs route.ts
│   │       ├── predictions/  # Train predictions
│   │       ├── rush-hour/    # Rush hour classification
│   │       ├── stall-config/ # Stall detection config
│   │       └── stall-report/ # Crowdsourced stall signal
│   ├── api-console/          # Admin API console
│   └── docs/                 # Public API docs
├── components/               # React components
├── domain/
│   ├── alerts/               # Alert logic (stall config)
│   ├── congestion/           # Congestion domain
│   ├── crowd/                # Crowdsource domain (broadcast, presence, stall)
│   ├── predictions/          # Prediction engine + API access
│   └── ...
├── hooks/                    # React hooks
├── store/                    # Zustand stores
├── types/                    # TypeScript types
└── data/                     # Static data (stations, lines)
```

## Verification Plan

- Build check: `npx next build`
- `curl` test all new endpoints: `/incidents`, `/incidents/resolve`
- `curl` test updated `/stall-report` with `reason` + `message` fields
- Two browser tabs → submit stall reports → verify quorum + PSA banner
- Verify auto-expire after TTL
- Verify resolve voting
