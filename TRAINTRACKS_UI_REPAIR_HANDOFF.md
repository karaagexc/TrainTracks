# TrainTracks Existing UI Repairs And Claude/Fable Handoff

Date: 2026-10-09, Asia/Manila. Workspace: `C:\Users\Exelec\Downloads\TrainTracks`.
Recovery gate rechecked on 2026-10-10, Asia/Manila.

## Authorization Boundary

Existing UI behavior was repaired in place. The new recovery, compass-permission,
manual-transfer, and missing retry/update interfaces below are specifications,
not implemented controls. Fable owns these new interfaces under the approved
boundary; parent verifies integration before release. Parent owns backend contracts, release,
commits, GitHub, migrations, and deployment. This UI work makes no production
writes and uses CLI/headless Playwright, not Computer skill/CUA.

**Release-blocking integration:** a valid checkpoint aged over 20 minutes and
under six hours becomes `pendingTripRecovery`. `beginTrip()` and `reset()` now
preserve it instead of overwriting the saved journey. Until the recovery decision
surface below calls `resumePendingTrip()` or explicitly confirmed
`discardPendingTrip()`, the commuter cannot start another journey. Do not ship
this intermediate state or bypass the guard to make a screenshot work. Test
real mounted resume, cancel and discard actions, not only direct store calls.

Read `TRAINTRACKS_TRAIN_AUDIT_2026-10-08.md`,
`TRAINTRACKS_CARD_REFERENCE_2026-10-08.md`, and the approved Reliability Repair
Plan before implementing the deferred interfaces. Do not mistake dormant cards
for mounted, working features. API console/docs are owned by the API agent.

## Claude/Fable Implementation Prompt

Implement the approved controls specified here, integrating
with the existing TrainTracks components and authoritative store. Preserve the
current design 1:1: Cabin fonts and weights, exact colors, spacing, translucency,
card shapes, badge sizes, shadows, existing animation timing, station diagram,
CARTO map styles, train-circle anchors and arrow-badge placement. No Astryx,
redesign, landing page, bus redevelopment, replacement map provider, additional
journey engine, broad CSS cleanup, generic dashboards, or alternate GPS inputs.
Do not change the current design to satisfy generic component-library defaults.
Use existing Radix primitives with the existing wrappers/classes, not their
default modal geometry. Restrict new controls to the requested existing surfaces.

Keep visible linked OpenStreetMap contributors/CARTO credits directly over the MAP. They must
remain transparent, readable in both themes, in the inherited font, without a
white background, padding strip, box, border, flag, or Leaflet label. The small
settings-menu reference supplements the map line; it never replaces it. Never
hide all credits behind a click. Vendor runtime classes remain outside Tailwind
layers. Never interpolate Leaflet pane/marker positioning with CSS transforms.

### Reference Screenshots

The audit evidence directory is ignored, local, and available to Claude/Fable:
`C:\Users\Exelec\Downloads\TrainTracks\.tmp-edge-debug\audit-20261008`.
These are CURRENT-design references, not proof that their values were correct:

| Screenshot | Reference purpose |
| --- | --- |
| `front-nav-walking-390.png` | EDSA -> Taft NAV, first leg bar, circle placement |
| `nav-390.png` | NAV instruction/distance composition |
| `checked-nav-360x640.png` | Compact portrait NAV fit |
| `checked-nav-412x915.png` | Tall portrait NAV fit |
| `checked-nav-844x390.png` | Landscape NAV fit |
| `front-transfer-handoff-390.png` | Receiving-line card after transfer |
| `front-arrival-390.png` | Receipt composition; old metrics must not be copied |
| `front-dark-390.png`, `front-light-390.png` | CARTO themes and existing card styling |
| `entry-390.png`, `moving-390.png` | Normal rail card states |
| `recovery-390.png` | Missing-prompt idle state; placement context only |
| `gps-loss-390.png`, `front-dead-reckoning-390.png` | GPS uncertainty/reconnection |
| `settings-390.png` | Small settings menu sizing/type |
| `dwell-390.png` | Existing safety-dialog styling and button geometry |
| `idle-360x640.png`, `idle-412x915.png`, `idle-844x390.png` | Existing responsive framing |
| `desktop-guard.png` | Handheld restriction that must remain |

Also inspect the post-repair files in `.tmp-edge-debug/repair-20261009`:
`ui-repair-dark-360.png`, `ui-repair-dark-390.png`, `ui-repair-dark-412.png`,
`ui-repair-dark-844.png` and their `light` counterparts. State evidence is in
`state-at_station-390.png`, `state-leaving_station-390.png`,
`state-between_stations-390.png`, `state-approaching_station-390.png`,
`nav-rail-dwell-390.png`, `raw-transfer-handoff-390.png`,
`actual-receipt-390.png` and `dr-unified-390.png`. These files were verified to
exist; they are repaired-state evidence, not assumed pre-repair baselines.
Compare against the available audit originals in both themes at 360x640,
390x844, 412x915 and 844x390. Allow only approved status/value/accessibility
corrections, new authorized controls, and the transparent attribution line.
Do not blindly regenerate the design from a prose description.

Actual baseline inspection used audit `front-nav-walking-390.png` against repair
`ui-repair-light-390.png`, audit `front-transfer-handoff-390.png` against repair
`raw-transfer-handoff-390.png`, and audit `front-arrival-390.png` against repair
`actual-receipt-390.png`. The originals and repaired files were opened, not
assumed from names. Card classes/type/rounding and circle/arrow construction are
retained. Metrics, progress, compass health, receiving-line state tint, map
camera position, hover scale and active animation phase differ between these
captures, so they are not deterministic whole-image pixel-equality baselines.
The receipt now shows measured route/time/fare rather than copying old numbers.
Reproduce the same state, theme, hover, viewport and settled animation before
making a new pixel-parity claim; remaining differences require explicit review.

### Reference Lock And Accessibility

The Refero default skill and its `references/craft-details.md` were read for
this handoff. This is direct repair of a locked existing product, not exploration
or a new design. The user's current screenshots/card reference are the primary
visual authority; bundled accessibility guidance has only a narrow supporting
role. No external style, typography, palette or component geometry is adopted.

| Decision | Locked reference/rule | Acceptance |
| --- | --- | --- |
| Existing card/map composition | audit dark/light, NAV, receipt and settings screenshots | Existing classes, Cabin font, station circles/arrow badges and animations preserved |
| Focus/keyboard repair | craft-details focus/semantic-control rules; existing Radix | Named controls, Enter/Space targets, dialog focus containment/return, Escape behavior, no default Radix redesign |
| Failed/pending status text | audit failure evidence and parent store acknowledgements | Same text slots, real errors, no success inferred from timeouts |
| Destructive discard | craft-details destructive-confirmation rule; existing safety dialog | Explicit confirmation, cancel/backdrop/Escape never discard |
| Visible credits | user-approved transparent map-line requirement | Always readable over map, both links, zero padding/background, no click-only credits |

New authorized controls must retain visible keyboard focus, communicate pending
updates with status/alert semantics, restore focus when closing, and remain usable
with zoom. Check full longest labels on compact and landscape viewports without
resizing the reference cards. Do not introduce broad CSS/spacing cleanup under
the name of accessibility; report any larger visual change for authorization.

### Shared Journey Contract

```ts
useTripStore.getState().beginTrip(): void;
useTripStore.getState().amendTrip({
  destination?: Station | null,
  ticketType?: TicketType,
}): void;
useTripStore.getState().confirmTransfer(edgeId: string): void;
useTripStore.getState().resumePendingTrip(): void;
useTripStore.getState().discardPendingTrip(): void;
useTripStore.getState().retainCompletedTrip(draft: Record<string, unknown>): void;
useTripStore.getState().acknowledgeCompletedTrip(): void;
useTripStore.getState().setHistorySaveFailure(error: string): void;
useTripStore.getState().discardCompletedTrip(): void;
useTripStore.getState().setPersistenceError(error: string | null): void;

historySaveState: 'idle' | 'saving' | 'queued' | 'failed';
historySaveError: string | null;
pendingCompletedTrip: Record<string, unknown> | null;
persistenceError: string | null;

// Authoritative snapshot fields, milliseconds/meters:
tripId: string | null;
startedAt: number | null;
completedAt: number | null;
routeVersion: number;
completedDistanceMeters: number;
```

`startTrip` is a compatibility alias, not an edit action. Never call start/begin
for an active edit, change the original origin, synthesize a GPS fix, call
`setCurrentStation`, or independently advance a trip. Amend preserves identity,
start time, confirmed station, traversed history and the active edge. Read the
current snapshot immediately before any confirmation; an old dialog may be
holding an obsolete edge/version. `confirmTransfer` is guarded by the parent
engine and may only finish the CURRENT `TRANSFER_WALK` target.

The first station card is `TicketCard`, not a separate StationBoard. MainApp
passes parent `railLegProgress` for a NAV route (route.totalTransferCount > 0)
or active transfer, otherwise parent `legProgress`. Do not calculate progress
in the UI. Ordinary NON-NAV rail progress remains adjacent-station progress.
During NAV the parent view supplies progress toward the selected transfer target,
with the walking leg separately represented. Do not reset the NAV value at each
intermediate adjacent stop. The lower journey bar always uses `totalProgress`.
Both progressbar ARIA values must match the clamped displayed values.

Wrong-direction action copy is `Reroute remaining trip`. The compatibility
updateOriginKeepTrip command now amends remaining route without changing the
original boarding origin. It must not claim origin changed or teleport the
confirmed station. A genuine wrong-way reroute requires the parent's fresh-GPS
validated route amendment after the current edge; preserve boarding/history,
tripId, start time and traversed prefix. Never synthesize a station fix to make
an alert disappear. Full mounted wrong-way recovery still needs its owner fixture.

### A. Recovery Confirmation (20 Minutes Through Six Hours)

Proposed component contract, NOT yet implemented:

```ts
interface TripRecoveryDialogProps {
  open: boolean;
  checkpoint: ActiveTripCheckpoint | null;
  origin: Station | null;       // resolve originId from the current catalog
  destination: Station | null;  // resolve destinationId, never trust stored text
  now: number;
  busy: boolean;
  error: string | null;
  persistenceError: string | null;
  onResume: () => void;
  onDiscard: () => void;
}
```

Bind `open` to `Boolean(pendingTripRecovery)`, passed from MainApp. The validated
v2 checkpoint has `version`, `ownerId`, `savedAt`, `tripStartedAt`, `originId`,
`destinationId`, `transitMode`, `selectedLine`, `ticketType`, `line7Mode`,
`isDevMode`, `runningFare`, and `journeySnapshot`. The persistence owner decides
auto/prompt/expired disposition. Up to and including 20 minutes auto-resumes;
older than 20 minutes through six hours requires this decision; older than six
hours expires. UI must not create its own restoration/validation rules.

Reuse the current safety-dialog composition and typography. Show recorded
origin/destination and when the checkpoint was saved. Commands: `Resume Trip`
and `Discard Trip`, calling the existing store functions once. Do not interpret
Escape, backdrop, or close as discard or resume. Keep the checkpoint intact when
temporarily closing only if product-approved, and provide a discoverable existing
surface to reopen it. Prefer an explicit decision modal that does not dismiss
through Escape/backdrop. Preserve navigation beneath it and active-trip/PWA
safety guards. Disable repeated decisions while busy. On failure retain the
checkpoint and show the actual failure, not a resumed success banner.
`persistenceError` is a real read/write/storage failure from useTripPersistence,
not evidence that no trip existed. Never claim a checkpoint is safely saved or
available offline while this error is present. A later retry action requires a
persistence-owner action that retries storage and clears the error only on an
acknowledged write; no card-owned IndexedDB writer or timer-based success.

Acceptance: fixtures at 19m59s, 20m00s, 20m01s, 30m, 6h, 6h+1ms; corrupted or
expired checkpoints never prompt/resume; simulation never recovers; same tripId
and startedAt survive Resume; Discard does not submit history or fake arrival;
owner mismatch cannot upload under a new account; modal focus and screen-reader
names work; service closure/maintenance cannot replace this decision.

### B. Explicit Compass Permission

`useDeviceOrientation()` now exposes:

```ts
{
  heading: number | null;
  error: string | null;
  status: 'unavailable' | 'prompt' | 'requesting' | 'waiting'
    | 'active' | 'denied' | 'error';
  requestPermission: () => Promise<boolean>;
}
```

Permission-gated browsers are not prompted from an effect. Add the later
authorized action inside the EXISTING NAV surface, sharing the same hook
instance used to rotate the arrow. Do not mount a second independent compass
listener merely for the button. Proposed integration:

```ts
interface CompassPermissionControlProps {
  status: CompassStatus;
  error: string | null;
  onRequestPermission: () => Promise<boolean>;
}
```

`prompt`: `Enable Compass`; invoke requestPermission directly in that click
gesture. `requesting`: pending/disabled, `Requesting...`. `waiting`: granted but
no usable heading yet, `Waiting for compass`. `active`: heading-driven Guidance
Active only while location and transfer target also exist. `denied`: `Compass
permission denied`, retain distance/sign instructions; a retry is user-triggered
and must not promise to override OS settings. `error`/`unavailable`: `Compass
unavailable - follow signs`, with useful route text and distance still visible.
Do not paint the default zero rotation as a north-bearing measurement.

Acceptance: no constructor exists; permission API rejects/denies/grants; no
sensor event after grant; finite webkit heading; absolute alpha; relative alpha
rejected as an unreliable north heading; wraparound smoothing; listener/RAF
cleanup; unmount during permission request; simulated heading remains supported.
Real iPhone/Android compass conventions require hardware QA, not only mocks.

### C. Uncertain-GPS Manual Transfer Confirmation

Proposed component contract, NOT yet implemented:

```ts
interface TransferConfirmationProps {
  tripId: string;
  routeVersion: number;
  phase: JourneyPhase;
  edge: JourneyTransferEdge | null;
  from: Station | null;
  target: Station | null;
  estimatorMode: JourneyEstimatorMode;
  estimatorConfidence: JourneyEstimatorConfidence;
  uncertaintyMeters: number;
  busy: boolean;
  error: string | null;
  onConfirm: (edgeId: string) => void;
  onCancel: () => void;
}
```

Only offer the approved command when phase is `TRANSFER_WALK`, the active
edge is `type: 'transfer'`, its target is the displayed transfer target, and the
parent marks GPS uncertain/untrusted. The parent's signal contract, not a UI
distance threshold, decides eligibility. Copy: `Reached [target.name]?` with
`Confirm Transfer` / `Keep Walking`. Require an explicit confirmation explaining
the target line/station in the existing NAV composition. Keep Walking/Escape/
close changes no journey state. Immediately recheck tripId, routeVersion, active
edge ID/type/target/phase before calling `confirmTransfer(edge.id)`. If anything
changed, close/refresh without confirming. Never confirm a future transfer,
final destination, rail edge, or a target inferred from a line pair.

Acceptance: good GPS completes automatically; uncertainty offers but never
automatically confirms; duplicate clicks and old edge/version are harmless;
two-transfer routes target the active interchange only; manual confirmation
cannot fabricate GPS, affect crowd presence, skip rail stations, or create an
arrival notification for a destination not yet reached. Progress/distance comes
back from the store view. No UI-owned advance function.

### D. Missing Retry, History And PWA Update Controls

Do not invent success flags. Reuse current buttons/surfaces and exact handler
contracts where available; keep all visible controls within the approved boundary.

| Surface | Existing data/actions | Required states and acceptance |
| --- | --- | --- |
| GPS scanning | TicketCard.scanningState `locationStatus`, `isRequestingLocation`, `onRequestLocation(): void \| Promise<boolean>` | Existing retry stays disabled/pending during request. Denied/timeout/unavailable remains truthful. No fake station selection or compulsory compass request. |
| Forecast cards | `predictionState`, `predictionError`, `predictionSnapshots`, `stationForecasts`, `predictionLastReceivedAt` | Loading, offline, failed, expired, service not-started/closed/suspended, and no arrivals are distinct. Retry needs a prediction-owner refresh action; no second fetch/writer in the card. |
| Configuration | `useMaintenanceMode`: `configStatus`, `configError`, `refreshConfig`, `remoteMaintenanceMode`, `maintenanceMessage` | Unknown/schema/network failure must not be called healthy or confirmed off. Retry calls refreshConfig. Service/config failures do not replace active navigation. |
| History reads | `useTripHistory`: `error`, `loading`, `fetchRecentTrips`, `fetchAllTrips`, `fetchMoreTrips`, `hasMore`, `totalsAvailable` | Preserve cached rows on errors, label unavailable instead of empty. Existing totals only show when acknowledged. Add authorized retry/pagination controls, guarding repeated requests. The hook needs an explicit recent-read loading state if recent fetching is not represented by `loading`. |
| Completed-trip retention | `historySaveState`, `historySaveError`, `pendingCompletedTrip`, captured `TripWrite.ownerId`, and save promise | MainApp synchronously retains before async enqueue. Only acknowledged durable retention clears the draft; queued does not mean API delivery. Pending/failed receipts cannot reset or start a new trip. Authorized retry/discard contracts are specified below. |
| Incident vote | `voteResolve(id): Promise<IncidentVoteState>`, `voteStates[id]` | `pending`, `queued`, `confirmed`, `error`. Only confirmed says Vote recorded. Queued stays awaiting delivery; an error retries the existing button. Later queued-delivery reconciliation needs hook/outbox acknowledgement, not a timer-based success. |
| PWA update | `usePwaUpdateRuntime({canActivate})` -> `{updateWaiting, activateUpdate(): Promise<boolean>, activationError}` | Mount once. MainApp's RuntimeServices already mounts it. Lift the same instance's returned state into the approved settings/status surface, do not duplicate mounts. canActivate requires persistenceHydrated, IDLE, no origin, no pending recovery and no pendingCompletedTrip. An update cannot replace/reset a journey. False activation is not success; locks/other tabs and errors remain visible. |

### E. Failed Completed-Trip Receipt (F07)

The existing receipt's status line now reports retaining/not-queued instead of
auto-closing while a draft is pending. END TRIP is disabled, fade/reset timers
are guarded, reset/begin are also guarded by the parent store, and beforeunload
requests the browser's standard warning. This is best effort: mobile OS/app
termination may bypass beforeunload and an unqueued in-memory draft is not a
durable recovery copy. Do not promise that storage failure is harmless.

Proposed authorized controls, NOT yet implemented:

```ts
interface CompletedTripRetentionControlsProps {
  state: 'idle' | 'saving' | 'queued' | 'failed';
  error: string | null;
  draft: Record<string, unknown> | null;
  onRetry: () => Promise<void>;
  onRequestDiscard: () => void;
  discardConfirmationOpen: boolean;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}
```

Place retry and explicit discard only in the existing receipt footer with its
current typography, spacing, shapes, and theme. `saving`: disabled retry/discard;
`failed` with draft: Retry and Discard with explicit confirmation; `queued`:
durably retained locally, not necessarily uploaded. Never use a fake Saved
state for quarantined/paused-auth items. Surface those owner/outbox diagnostics
when the offline owner exposes them. Do not build another queue in this UI.

Retry must use the exact retained TripWrite fields, especially captured ownerId,
client_trip_id, origin/destination, fare and recorded timestamps/distance. Never
recalculate the payload from today's snapshot or bind it to the currently signed
in account. Parent should expose a shared retry action that sets saving, invokes
saveTrip with the existing draft, acknowledges only committed enqueue success,
and sets failed on rejection, with draft-identity checks. It may optionally retry
on online/storage recovery through that same action; no concurrent submissions.
Until such action exists, onRetry is a required integration contract, not a stub.

Confirmed discard calls discardCompletedTrip then reset exactly once. Cancel,
Escape, backdrop and closing confirmation preserve the draft and receipt. An old
dialog must verify the same client_trip_id/owner/draft before discarding. A
successful acknowledgement may resume the existing 60-second close timer; a
failure never fades the receipt away. Dev simulations are never saved to history.

Acceptance: quota failure in both IndexedDB and localStorage fallback retains
the receipt beyond 60 seconds, END TRIP/reset/begin cannot remove it, enqueue
rejection displays failed and unload asks for a warning; original owner survives
sign-out/account changes; retry preserves idempotency/metrics and double-click
cannot duplicate; committed enqueue clears pending, API delivery is not inferred;
401/403/MRT7-live rejection do not lose durable records; discard is explicit;
persistenceError never becomes an empty/saved success; pending drafts block PWA
activation and maintenance/service screens cannot replace the receipt.

## Implemented Existing Repairs

- FareSelector uses begin/amend commands, Radix focus/Escape, and a named Back
  action without changing its wrapper geometry. MainApp no longer immediately
  reopens it after Escape. The existing fare badge now invokes its edit callback.
  The existing changed-destination action opens its existing DESTINATION step
  through initialStep; it no longer exits through a fare-type-only edit. No new
  picker/control/route flow was added. Completed receipts cannot edit fare type.
- TicketCard receipt uses completed route meters and recorded elapsed time. Its
  delayed reset is cancelled/identity-guarded against resetting a different trip.
  MainApp synchronously retains its owner-bound draft before saveTrip, acknowledges
  only the resolved durable enqueue, records failures, and skips dev simulations.
  History direction uses parent getJourneyEntryDirection(snapshot.route), not the
  final line's state.direction; walking-entry routes retain null as contracted.
  Pending receipts pause auto/manual close, keep errors visible, warn on unload,
  and block PWA activation and replacement maintenance/service screens.
- TripProgress labels runningFare `Fare So Far`, labels the full breakdown a
  quote, derives the next transfer point from route-edge station IDs, and treats
  numeric zero distances as valid. Both bars have semantic progress attributes.
  The breakdown passes authoritative computedRoute (Station[], repeats preserved)
  and journeySnapshot.startedAt. FareSegmentQuote verification metadata marks
  unverified quoted totals and receipt fare in the existing label slots; a note
  remains available through the label title. No fabricated fare replacement.
- LineExplorer station targets support Enter/Space. Scroll, touch, wheel, tabs
  and POV changes start its inactivity follow timer; timers clean up and use the
  latest station/line target.
- Compass missing/permission states are truthful; no automatic permission prompt
  and no unguarded missing DeviceOrientationEvent constructor access.
- Maintenance, holiday and closed screens cannot replace active or pending
  journeys. Final notification hook remains mounted before the screen gates.
- Safety reminder identity uses snapshot.tripId, preserving dismissal on amends.
  Both dismissed flags persist under `traintracks:safety-dismissals:v1` in
  sessionStorage, bounded to the latest 20 trip IDs. Timers wait for flags to
  load; same-trip validated restore after reload retains dismissed flags.
  Automatic recovery after the parent persistence patch passed the preliminary
  local production rerun; hardware eviction remains unverified.
  Storage failure is best effort and never blocks the journey or claims success.
- Platform cards include station-scope forecasts behind real observations,
  deduplicate dispatches, use supplied forecast timing, and keep them off the map.
  Offline/error/stale labels remain visible when retained forecasts are present,
  not only when the list is empty.
- Votes and history empty/error states no longer assert unacknowledged success.
- Handheld/cookie restrictions and shortcut/context-menu deterrents remain;
  geometry/debugger timing probes no longer lock legitimate mobile browsers.
  While the existing production overlay blocks device/cookie policy, the stable
  traintracks-app-root is inert and aria-hidden; contained focus is blurred.
  Cleanup restores previous attributes for allowed/admin/developer states.
  This preserves visuals and is not an auth boundary or a polling pause.
- Map credits are always visible over the map, plus a settings reference. Original
  circles, anchors and arrow badges are unchanged. Hover scaling is applied inside
  the Leaflet marker, never to its translated outer element. Leaflet import and
  ongoing interpolation setup handle readiness/current rendered positions.
- Onboarding no longer claims accelerometer fusion or guaranteed locked-screen
  stop delivery. Viewport now allows user scaling.
- MainAppShell, LineExplorer and TicketCard use narrow shallow store selectors;
  unrelated polling/fleet state no longer drives their full-store subscriptions.
  MainApp's setOrigin reads only the stable action. Runtime animations unchanged.

## Integration Caveats

New interfaces above are intentionally absent. Do not call their absence repaired.
The current active-origin flow still prioritizes companion cards over the
spectator detail card after an upcoming-row selection. Preserve navigation; any
new placement/back-to-companion interaction belongs to the authorized handoff,
not an ad hoc new flow. A forecast is not a followable physical vehicle.

Parent useOperatingHours now reads the shared Manila service-calendar engine.
MainApp's legacy 2026 Holy Week date window remains an idle-only gate; reconcile
that redundant date-specific screen with the calendar owner before release.
The UI never independently advances
stations or computes NAV progress. Physical GPS, locked-screen notifications,
sensor conventions, and actual assistive-technology behavior remain hardware QA.
The current saveTrip resolves after enqueue plus an attempted flush; a later
flush/storage rejection conservatively retains the receipt as failed even if an
item was already durably inserted. Offline owner should expose enqueue retention
acknowledgement separately from delivery/flush diagnostics for exact statuses.
Queued here means retained, never server-confirmed or guaranteed deliverable.

F14 remains incomplete as a data-verification task. Parent fare-verification
smoke reports 600 unverified directed LRT1 CONCESSION cells. Unknown matrix cells
and relief bands stay unverified; exposing metadata is not verification of those
fares and must not be reported as F14 fully repaired.

The reversed-within-paid-rail policy note is consumed by receipt and quote labels.
The existing quote block now also renders for unverified same-line quotes, without
new classes or controls. A preserved L1-20 -> L1-19 -> L1-20 route therefore
retains its numeric placeholder but labels it unverified with the operator
confirmation note. Isolated rendering passes; the rebuilt production bundle
still needs its final browser check. This is not a verified free fare.

## Verification

Checked-in harness: `scripts/frontend-repair-smoke.cjs`, self-contained TS alias/
transpile loader, isolated render fixtures and CLI/headless Playwright, all
mutating browser requests aborted. It reuses the earlier audit approaches without
requiring/overwriting ignored audit scripts. Results, screenshots and CPU profiles
are under `.tmp-edge-debug/repair-20261009`. It defaults to local port 3100; set
FRONTEND_REPAIR_URL for another local server. Webpack is required for private
store fixture access; use `npm run dev -- --webpack -p 3100`, not Turbopack. No
production backend writes; map tiles are read-only public CARTO proxy fixtures.
Actual service workers are blocked in the QA contexts so network interception
cannot be bypassed by an installed worker. Waiting-worker/update/notification
contracts use explicit isolated mocks; this does not certify installation,
real worker lifecycle or Android background notification delivery.
The harness prefers local `playwright`; PLAYWRIGHT_MODULE_PATH can override it,
with the Codex bundled runtime under os.homedir as the fallback. Set
PLAYWRIGHT_CHROME_PATH for a different browser binary. FRONTEND_REPAIR_PRODUCTION=1
identifies the parent-provided webpack production run; FRONTEND_REPAIR_UNIT_ONLY=1
runs the server-free render/session/PWA-selector-helper checks.
Repaired screenshots and result JSON are under `.tmp-edge-debug/repair-20261009`;
the audit originals remain under `.tmp-edge-debug/audit-20261008`.
TypeScript `npx tsc --noEmit --incremental false` passed after parent integration.
Train-presence and incident smoke suites passed. Focused lint remains warningful;
the newly introduced onboarding apostrophe error was corrected. Full build,
release, exhaustive card regression, pixel-diff certification and real-device
tests belong to parent and must not be inferred from these focused checks.

The render fixtures cover station-forecast observation priority/dispatch
deduplication, both platform cards' forecast presentation, unavailable/offline/
closed status text, a real numeric zero next-distance, progress semantics and
recorded receipt distance/elapsed time. Mounted checks cover FareSelector focus,
Escape staying closed, active fare amendment retaining tripId/startedAt/station,
keyboard station opening/closing, no effect compass prompt, fallback NAV text,
both progressbars, maintenance not replacing NAV, transparent readable credits
in both themes at all four mobile sizes, marker hover retaining its Leaflet
anchor transform, and the ten-second line-follow timer. The follow-tab timer
was invoked through its existing DOM click handler after an offscreen pointer
fixture timed out; this is not a claim that every pointer/scroll combination
was tested. Quota fixtures cover synchronous owner-bound draft retention,
simulation exclusion, disabled END TRIP, unload warning, and receipt survival
beyond the auto-close interval. Safety fixtures cover both stored flags, the
20-entry bound, malformed storage, amendments, and same-trip auto-recovery.
The comprehensive pass additionally covers all four rendered train labels and
both ARIA/displayed progress values, cumulative rail-leg fill across intermediate
dwell, preserved-route quotes, raw mocked GPS transfer/receiving-line handoff,
reducer-produced final receipt and notification mounting, aged trusted snapshot
plus TICK for DR (never an aged fix claimed live), unified effective position/
speed/map framing, retained HTTP snapshots across one-second dwell/transit/NAV
ticks, map-canvas pixels through pan/zoom/resize/orientation, and real-animation
normal/4x CPU frame/network/input probes. It records failures and explicit pending
branches rather than declaring every card passed.

Last completed development run: 84 checks passed, one failed, 26 screenshots,
no uncaught page errors. These are check counts, not 24-card certification.
The historical connection-refused attempt and interrupted replacement dev run
were not new functional verdicts. Preliminary local production evidence is
retained in `production-pre-attribution-results.json`: 90 passed checks, two
reported failures, no uncaught page errors and 26 screenshots. One failure is
the same-line warning gap, now repaired in source. The other demanded absent DOM
controls behind the desktop gate; the actual contract is its existing covering
overlay. Natural Tab subsequently reached an underlying control, so app-root
inert/aria-hidden isolation was added with attribute restoration and focus blur.
The corrected fixture checks covering hit tests, blocked pointer input, hidden
role controls and Tab/Enter isolation, not unmounting or an auth-security boundary.
The final rebuilt bundle still needs these source repairs and longer attribution
verified. Background polling is not claimed paused by the device policy.

Preliminary production animation-enabled 5-second profiles used a sparse fleet,
so they are not the final representative workload. Normal RAF p95 was
17.4 ms, max 17.8 ms; 4x CPU p95 33.1 ms, max 50.6 ms. Input event to two RAF
frames was 15-37 ms normal and 35-86 ms at 4x. Each profile window transferred
about 6.2/7.1 KB (8/9 requests). Requests/predictions are isolated and map tile
responses are cached public read-only fixtures, so these are not real commuting
data-use budgets or hardware thermal certification. Final profiling seeds a
moving journey and six fresh moving crowd samples along actual adjacent rail
paths across LRT-1/LRT-2/MRT-3. It records mounted/clustered fleet counts and
changing Leaflet marker transforms with real animations left enabled. Production
environment metadata is explicit; mocked/CDP byte counters remain separate from
parent real API payload/compression measurements and never imply MB/hour.

Previously reproduced parent-owned reload blocker: a valid v2 checkpoint passes parsing before
reload, but development Strict Mode cleanup can call persistCheckpoint while
the fresh store is still IDLE/unhydrated, deleting the checkpoint before the next
initialization restores it. Parent has now guarded initialization/readability
and unknown-data writes; automatic restore and retained dismissal passed the
preliminary production browser check. Same-trip explicit validated
restore is separately tested so UI sessionStorage dismissal behavior is not
confused with checkpoint restoration. Do not claim auto-recovery passed while
the specific bundle's patched production rerun verifies it.

### Coverage Boundaries

| Current/reference branch | Evidence or explicit gap |
| --- | --- |
| Ticket scanning/detection/transfer choices | Mounted initial station tap/fare; denied GPS/onboarding fixture; timeout/unavailable/insecure/poor-accuracy thresholds and all interchange choices pending |
| Four train states and receipt | Reducer-produced mounted labels, cursor/progress, actual meters/timestamps; physical GPS/door behavior pending |
| Journey/NAV bars | railLeg/whole-trip/adjacent semantics, intermediate monotonicity, walking and receiving-line reset; every line/direction/route replay pending |
| Upcoming/Spectator | Mounted station forecasts, retention/status; observation priority/dedup isolated render; selected physical train follow/unfollow and active-origin placement pending |
| LineExplorer/StationInfo/Fare | Keyboard open/Escape, focus, amendment identity, follow timer; every image/gallery/long label/touch sequence pending |
| History/Profile/Auth | Error/empty/totals presentation source/isolated coverage only; authenticated mounted reads, pagination and actions belong to owner fixtures and remain pending here |
| Wrong-direction/congestion/stall/incidents | Existing congestion dismiss sampled; votes source contract and incident smoke; emergency/traffic/stall/manual reports and all vote delivery branches pending in frontend harness |
| Reconnection/fallback | TICK DR, effective speed/location/camera and banner sampled; hardware GPS recovery, simulator-only GPSFallbackHandler and every uncertainty boundary pending |
| Safety | Both bounded session flags/corrupt data fixtures, pre-board dismissal/amendment/reload restoration check; in-transit mounted dialog and native assistive tech pending |
| Crowd consent/notifications/settings | Existing settings controls sampled; consent actions, denied/default permission prompting and locked-screen delivery pending |
| Welcome/blocking/phone/cookies | Welcome/denied GPS and active maintenance guard sampled; production-only phone/cookie gate and calendar-screen mounting pending final local production build |
| Developer/API/dormant cards | Not certified here: CommandCenter/DevMonitor, ApiConsole/ApiDocs owner, NotificationSettings, TrackingCard, InfoCard, StationTimeline, GeofenceScanner, DevControls, DevDashboard, any unmounted NearbyStations branch |
| New Fable interfaces | Specifications only; Fable owns recovery/compass/manual transfer/retry/discard/update controls under the approved boundary, with parent verification before release |

All 24 repair objectives/cards, all reference cards, full pixel-diff certification,
all mobile overlay combinations, local production and hardware are NOT claimed
passed. Performance numbers from dev/HMR/mocked responses are not release budgets;
measure parent final production bundle separately.

## Changed Files In This UI Work

`src/app/globals.css`, `src/app/layout.tsx`, `src/hooks/useDeviceOrientation.ts`;
`src/components/FareSelector.tsx`, `LineExplorer.tsx`, `LiveTrainLayer.tsx`,
`MainApp.tsx`, `MapExplorer.tsx`, `RecentTripsCard.tsx`, `ReconnectionBanner.tsx`,
`SecurityGuard.tsx`, `ServiceDisruptionBanner.tsx`, `SpectatorInfoCard.tsx`,
`StationInfoModal.tsx`, `TicketCard.tsx`, `TripHistoryModal.tsx`, `TripProgress.tsx`,
`UpcomingTrainsCard.tsx`, `CongestionAlert.tsx`, new `platformForecasts.ts`,
`WrongDirectionAlert.tsx`,
`src/components/screens/JourneySafetyReminders.tsx`,
new `src/components/screens/safetyReminderDismissals.ts`,
`src/components/screens/WelcomeScreen.tsx`, and this handoff document.
Checked-in `scripts/frontend-repair-smoke.cjs` is also part of this ownership.

Ignored QA harness/logs/screenshots were added only under `.tmp-edge-debug`.
Preexisting MapExplorer/globals work was preserved and extended, not reverted.
Generated AGENTS.md was read and retained. Other agents' files, generated PWA
output, package changes and release operations are not part of this ownership.
