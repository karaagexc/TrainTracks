# Opus 4.8 Handoff - Stall Incident UI/Docs Follow-Up

## Completed Logic
- Added incident-ready stall reports with `reason` and optional sanitized `message`.
- Added internal app route `POST /api/stall-report` for browser submissions without exposing public API tokens.
- Kept public token-gated `POST /api/public/stall-report` and wired it into the incident pipeline.
- Added in-memory incident aggregation:
  - 3 unique device hashes within 10 minutes and 2km confirms an incident.
  - Active incidents auto-resolve after 30 minutes without fresh reports.
  - 3 unique resolve votes close an incident.
  - Max 3 active incidents per line.
- Added public token-gated incident endpoints:
  - `GET /api/public/incidents?line=LRT1`
  - `POST /api/public/incidents/resolve`
- Added Supabase Realtime incident event relay on `traintracks:incidents`.
- Wired existing `StallAlert` callbacks through `useStallDetector` with no visual changes:
  - Slow Traffic -> `confirmed_traffic` + `slow_traffic`
  - Emergency Stop -> `confirmed_emergency` + `full_stop`

## Remaining UI/UX Work
- Add a non-intrusive service disruption banner for confirmed incidents.
- Add an incident listener hook to subscribe to `traintracks:incidents` and filter by active line.
- Add reason picker UI to `StallAlert` if desired.
- Add "Trains moving again?" action that calls `/api/public/incidents/resolve` or an internal app resolve route.
- Keep visual work consistent with existing glassy TrainTracks styling and avoid changing core trip UI layout.

## Remaining Docs/Admin Work
- Update API Docs for:
  - `GET /api/public/incidents`
  - `POST /api/public/incidents/resolve`
  - Updated `POST /api/public/stall-report` payload fields.
- Update API Console Config tab with incident thresholds.
- Update API Console Live Stats with active confirmed incidents.
- Verify and clean any remaining mojibake in API Docs/Console text.

## Acceptance Checks For UI Pass
- Existing stall prompt still looks unchanged unless intentionally redesigned.
- Confirmed incidents appear only after quorum, not after a single report.
- Resolved incidents disappear after realtime `incident_resolved`.
- MRT-7 never appears in public live incident flows.
- Public API remains token-gated; live app submissions do not require exposing a token.
