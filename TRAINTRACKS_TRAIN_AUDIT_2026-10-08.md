# TrainTracks Train Audit

Date: 2026-10-08, Asia/Manila

## Verdict

The normal routing and transfer-progress foundations pass substantial tests, but the app is **not ready for a claim of flawless real-world reliability**. The largest reproduced problems are station-to-track mismatch, a disconnected dead-reckoning display, missed final-arrival alerts, mid-trip edits resetting the station cursor, offline history loss after authentication failure, and heavy synchronous prediction work.

This is a completed audit within the agreed read-only boundary, not certification of every phone, physical journey, account operation, or privileged production database policy. All known coverage gaps are listed below. A passing build or HTTP 200 is not a substitute for those checks.

Scope: LRT-1, LRT-2, MRT-3, their transfers, shared commuter features, auth/admin, and API infrastructure. Bus journeys were excluded. MRT-7 was checked only for live/sandbox separation and existing maroon branding tests.

No application/API implementation was adjusted during this audit. No production migration, configuration change, account change, token creation/revocation, crowd broadcast, incident vote, or trip-history write was performed. Browser write requests were blocked; successful mutation paths were exercised only with isolated mocks. No Computer skill or native computer-control tool was used. Frontend testing used CLI Playwright and headless Chrome.

The earlier requested attribution removal remains a separate local change in `MapExplorer.tsx`/`globals.css`. It was not committed, pushed, or deployed by this audit. The CARTO basemap was not replaced. Build-generated service-worker output is excluded from the audit's intended changes.

For the meticulous explanation of what every card does, see [Every Card and Panel](C:/Users/Exelec/Downloads/TrainTracks/TRAINTRACKS_CARD_REFERENCE_2026-10-08.md). Its initial testing-status section is superseded by this report.

## Direct Answer: The NAV MODE Bar

**Yes. The first card should fill as you approach the transfer point.** It receives the current edge's `legProgress`, including a walking-transfer edge. The lower Trip Progress bar receives the complete route's distance-weighted `totalProgress`; these are intentionally different.

The mounted frontend test selected LRT-1 EDSA -> MRT-3 Magallanes and walked the EDSA -> Taft transfer with controlled GPS samples:

| Walk fraction | First-card progress | Remaining walk | Rendered white-bar width |
| --- | --- | --- | --- |
| Start | 0% | 165 m | 0% |
| 15% | 15% | 140 m | 15% |
| 30% | 30% | 116 m | 30% |
| 50% | 50% | 83 m | 50% |
| 70% | 70% | 50 m | 70% |
| 85% | 85% | 25 m | 85% |

NAV MODE remained visible during the walk. Reaching the target handed off to Taft Avenue with `AT_STATION`, without reopening the transfer. The top bar resets for the receiving rail segment. Actual pixel widths were also checked after the transition settled.

Important limitation: the current walking-progress calculation projects onto the straight line between endpoints. It does **not** follow a surveyed walkway, staircase, bridge, or indoor path. A far/poor GPS fix can falsely fill it to 100%; see F10.

Sources: [view model](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTripLogic.ts:20), [transfer projection](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:216), [rendered leg bar](C:/Users/Exelec/Downloads/TrainTracks/src/components/TicketCard.tsx:665).

## Findings, In Priority Order

Evidence labels: **Frontend** = reproduced in the mounted local production app; **Domain** = actual project logic with controlled inputs; **Live Read** = non-mutating production/backend probe; **Source** = code/migration contract, not a successful production mutation test.

### F01 [P1] Station Catalog And Rail Paths Disagree

Evidence: Domain, with frontend corroboration at Dr. Santos.

All 96 directed adjacent-station legs were tested using the app's own station coordinates, GPS source, and 5 m declared accuracy. At origin, **26/96** rejected that coordinate as untrusted; **16/96** did not remain in the expected origin-waiting phase. After moving along the path and providing two stopped destination fixes separated by four seconds, **42/96** did not reach `ARRIVED`.

| Line | Directed legs | Untrusted origin fixes | Missed final arrival in fixture |
| --- | --- | --- | --- |
| LRT-1 | 48 | 8 | 14 |
| LRT-2 | 24 | 10 | 16 |
| MRT-3 | 24 | 8 | 12 |

Examples of distance from catalog station to computed segment: 5th Avenue -> R. Papa about 629 m; Blumentritt -> Abad Santos about 592 m; United Nations -> Central about 572 m. Dr. Santos -> Ninoy Aquino is about 73.85 m, just outside the 73.25 m corridor allowed for a 5 m fix.

The path builder scores nearby graph nodes rather than anchoring/clipping at station projections. The real-GPS trust check uses that path; simulation has an additional station-anchor exception. This explains why convincing simulated journeys can pass while catalog-coordinate GPS tests fail. The audit does not establish which catalog/GeoJSON coordinates match surveyed physical platforms; their internal disagreement is established.

Impact: false GPS uncertainty/reconnection, unreliable CURRENT STATION, missed arrival, wrong progress/distance, and suppressed safety reminders. Fix the coordinate/path contract before widening geofences indiscriminately.

Sources: [candidate path](C:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/trackGeometry.ts:213), [journey geometry](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/geometry.ts:35), [GPS trust](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:342).

### F02 [P1] Dead Reckoning Does Not Reach The Shared Map/Speed Channel

Evidence: Domain and Frontend.

With a trusted 40 km/h rail fix aged 16 seconds, real one-second runtime ticks activated dead reckoning and advanced `estimatedLocation`. However, `isFallbackLocationActive` remained false, and `useLocationStore.sample` stayed on the previous GPS location at 0 km/h. The runtime explicitly sets the fallback-active flag to false even while it publishes fallback coordinates and speed. `useSmartLocation` only selects those values when that flag is true.

Impact: journey distance/progress, map position, speedometer, and reconnect indicator can disagree during the exact signal-loss scenario commuters need most. Use one authoritative estimated sample with truthful source/confidence for all consumers. Do not broadcast that estimate as a confirmed crowd GPS fix.

The reducer's conservative model itself exists: coasting after 8 s, dead reckoning after 15 s, uncertainty cutoff at 90 s or 650 m, braking near the next station, and a maximum 2 s integration step. It is not accelerometer fusion or proof of background operation.

Sources: [runtime flag](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useJourneyRuntime.ts:111), [fallback selection](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useSmartLocation.ts:493), [speed consumer](C:/Users/Exelec/Downloads/TrainTracks/src/components/TripProgress.tsx:81), [estimator tick](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:540).

### F03 [P1] Final Arrival Notification Is Missed

Evidence: Domain, Source, and Frontend with notification permission granted and delivery captured.

The final snapshot emits status code `ARRIVED`. The notification hook recognizes destination arrival only when the code is `AT_STATION`. The receipt appeared and END TRIP worked, but no `You have arrived!` notification was issued. This affects both normal-all and destination-only notification expectations.

Fix the event contract and deduplication around the final transition, then test notification permission, mute/preference, foreground/background delivery, and repeated ticks independently.

Sources: [arrival status](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:128), [notification condition](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTripNotifications.ts:74).

### F04 [P1] Live Configuration Schema Mismatch Silently Disables Synchronization

Evidence: Live Read and Frontend network observation.

The shared backend returned HTTP 400 / PostgreSQL `42703`: `column app_config.congestion_config does not exist`. Reading only maintenance fields succeeded and returned `maintenance_mode: true`. The app combines those fields with the missing column in one request, then returns immediately on error, leaving its local default maintenance state unchanged.

Impact: remote maintenance and congestion configuration do not reliably control commuter clients. Authorized admin config GET/PATCH also select this column and would encounter the same missing-column contract once authorization succeeds. Anonymous admin calls correctly fail before that query.

Reconcile the deployed schema with the shipped migration and implement an explicit configuration-error state. **No migration or flag change was applied.** Restoring synchronization could immediately expose the currently true maintenance flag, so confirm the intended operational state before release.

Sources: [combined select/error return](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useMaintenanceMode.ts:35), [migration](C:/Users/Exelec/Downloads/TrainTracks/supabase/app_config_migration.sql:12), [admin query](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/admin/config/route.ts:30).

### F05 [P1] The Active Prediction Tick Blocks The Main Thread

Evidence: Frontend frame probes and Chrome CPU profile.

Unthrottled spectator sampling produced a 16.7 ms median and 33.3 ms p95 frame interval over a short capture. Under a 4x CPU + 1.6 Mbps / 150 ms network fixture, only three frame intervals were observed over the nominal 2.5-second capture, with roughly 1.5-second gaps and long tasks up to 2.42 seconds.

A separate 4x CPU retest **with service workers allowed** reproduced frame gaps of about 950, 883, and 733 ms. Its largest long task was 2.07 seconds. The CPU profile's hottest function mapped to `getManilaParts`: **4,017 of 8,416 node hit counts, about 47.7%**, in this particular capture. It repeatedly constructs `Intl.DateTimeFormat` while the dispatch loop rebuilds schedules. This is a measured hotspot, not a guess that CSS animations caused the lag.

Cache/reuse the formatter and dispatch schedules, separate cheap positional interpolation from full schedule generation, and consider a worker for expensive model/geometry work. Narrow broad store subscriptions and batch shared sample publication. Keep the existing design and animations; profile compositing separately after the logic work.

These are desktop-headless throttling measurements, **not measured FPS on a real low-end phone** and not a universal 30/60 FPS guarantee.

Sources: [formatter](C:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/engine.ts:220), [dispatch loop](C:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/engine.ts:439), [one-second computation](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/usePredictedTrainPresence.ts:134).

### F06 [P1] Mid-Trip Changes Reset Confirmed Position

Evidence: actual Zustand store / reducer fixture.

Starting FPJ -> Gil Puyat and advancing to 5th Avenue gave `TRANSIT`, confirmed `L1-17`, and 33.2% progress. Changing the destination to EDSA reset confirmed station to FPJ `L1-20` and progress to 0%, while retaining departed=true and TRANSIT. The setter anchors the new route to the original origin, not the confirmed current station.

Separately, the fare-selector sequence `setTicketType` + `startTrip` on an existing destination reset the confirmed station, progress, departure evidence, status, and start timestamp. This path is coded for editing/reselection, even though the active TicketCard's supplied edit callback is not attached to its JSX.

Impact: route repair, destination changes, fare edits, safety timers, and history duration can clash with an ongoing journey. Define explicit new-trip versus amend-trip commands and preserve confirmed location/history identity during amendments. Add mounted wrong-direction repair tests before enabling more edit entry points.

Sources: [destination anchor](C:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts:420), [startTrip reset](C:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts:482), [fare restart](C:/Users/Exelec/Downloads/TrainTracks/src/components/FareSelector.tsx:62).

### F07 [P1] Offline History Is Deleted On Authentication Failure

Evidence: actual outbox with isolated IndexedDB/fetch adapters.

HTTP 401 and 403 both removed a queued trip: sent=0, remaining=0. HTTP 408, 429, and 500 correctly retained it with backoff. A transient session expiry is not evidence that the commuter wants their completed trip discarded.

Retain/quarantine authentication-dependent history until the correct account reauthenticates, and distinguish permanent payload rejection from recoverable session failure.

Source: [4xx deletion](C:/Users/Exelec/Downloads/TrainTracks/src/domain/offline/outbox.ts:94).

### F08 [P1] Dependency Security Review Is Due

Evidence: `npm audit --json` and maintainer advisories, no exploit testing.

Audit reported **23 affected packages: 1 critical, 16 high, 6 moderate**, including runtime and build/development dependencies. Installed Next.js is 16.2.11. The critical package count is not a count of proven exploitable production endpoints.

The Windows-hosted server advisory affects the installed version and is especially relevant to publicly exposed Windows self-hosting; the audit server was bound to loopback. The Node `next/og` advisory depends on attacker-controlled SVG input; no `ImageResponse` use was found in application source. These conditions must not be misreported as a proven Vercel compromise. Other advisory ranges also require review before selecting a patched version.

Perform a scoped dependency upgrade and rebuild/PWA regression check, not `npm audit fix --force`. No packages were changed.

Sources: [Windows-hosted Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [Node ImageResponse advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [manifest](C:/Users/Exelec/Downloads/TrainTracks/package.json:32).

### F09 [P2] A Stopped Train Can Remain NOW LEAVING

Evidence: Domain regression.

After moving 80 m at 10 km/h, returning to the current station with two 0 km/h fixes still left `ONBOARD_MOVING` / `LEAVING_STATION`. Dwell at the current station is phase-gated after departure. This can follow jitter/false departure, and differs from the speed filter successfully reaching zero.

Require stable station/accuracy evidence to recover dwell after false departure without treating every low-speed mid-track stop as a station arrival.

Source: [dwell gate](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:398).

### F10 [P2] A Poor Transfer Fix Can Permanently Fill The Bar

Evidence: Domain; normal walking behavior passed in Frontend.

A fix far from the walkway with 500 m declared accuracy produced `TRANSFER_WALK`, mode LIVE, 100% leg progress, and 0 m remaining. It did not complete the transfer, but the progress high-water mark preserved the misleading display. Accuracy/proximity gates completion, not progress. The hard 10 m completion branch also accepts proximity without the broader accuracy condition.

Validate transfer fixes against freshness, accuracy, and a sensible corridor/path before applying monotonic progress. Keep remaining-distance and completion evidence consistent. This is the qualification to the passing NAV MODE bar test.

Source: [transfer progress and completion](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:238).

### F11 [P2] Recovery Prompt State Has No Rendered Prompt

Evidence: Domain boundaries, Source, Frontend checkpoint fixture.

Checkpoints up to 20 minutes auto-resume; ages just over 20 minutes through six hours enter `pendingTripRecovery`. A 30-minute checkpoint loaded into that pending state but rendered the normal idle home screen, with no Resume/Discard interface. Store actions exist, but no current component consumes this pending state.

The checkpoint validator also accepted invalid edge types and NaN/Infinity in snapshot metrics. Rebuild/validate routes and numeric fields before restoring; add a real recovery decision surface. Test process eviction and upgrade-version compatibility.

Sources: [prompt disposition](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTripPersistence.ts:124), [pending actions](C:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts:582), [partial snapshot validation](C:/Users/Exelec/Downloads/TrainTracks/src/domain/offline/tripCheckpoint.ts:64).

### F12 [P2] Two Prediction Writers Replace Each Other

Evidence: Frontend with an isolated HTTP prediction fixture.

The HTTP response's sentinel prediction appeared in `rawTrains`, then disappeared about **719 ms later** when the local tick replaced all predicted entries. Both effects write the same prediction store. The fetch and local model currently share an implementation, but their clocks, versions, and future server enrichment need not agree.

Use a single prediction snapshot authority and interpolate its presentation locally. Keep remote freshness separate from local render time; currently `lastPollTimestamp` is refreshed by both setters.

Actual network cadence is 15 s normally, 20 s on 3G, 30 s in saver/2G. Presentation recomputation is every second. The commuter client does **not** use the available SSE endpoint. A moving per-second marker is not a fresh per-second physical observation.

Sources: [HTTP writer](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/usePredictedTrainPresence.ts:72), [local writer](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/usePredictedTrainPresence.ts:138), [store replacement](C:/Users/Exelec/Downloads/TrainTracks/src/store/useTrainStore.ts:145), [network policy](C:/Users/Exelec/Downloads/TrainTracks/src/domain/network/runtime.ts:46).

### F13 [P2] Platform Cards Discard Station-Scope Forecasts

Evidence: Source and rendered empty-state observation; filtering behavior is not an operator-feed test.

The runtime fetches station-scope forecasts, but UpcomingTrainsCard and station spectator details exclude all entries with `predictionScope === 'station'`. They reconstruct ETAs from map-entry station IDs and complete segment times instead of consuming the supplied platform-arrival forecast/current segment progress.

At an originating terminus, no approaching map train can be found even when future platform departures can be forecast. The empty card's wording does not distinguish unavailable estimates, failed fetch, service closure, and no matching train. A selected upcoming train also enables spectator mode, but MainApp still prioritizes companion cards while an origin exists.

Wire station forecasts into the platform presentation while keeping physical crowd/operator observations prioritized and distinctly labeled. Confirm ETA semantics and click behavior with deterministic platform fixtures.

Sources: [request builder](C:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/clientRequests.ts:49), [upcoming exclusion](C:/Users/Exelec/Downloads/TrainTracks/src/components/UpcomingTrainsCard.tsx:144), [spectator exclusion](C:/Users/Exelec/Downloads/TrainTracks/src/components/SpectatorInfoCard.tsx:193).

### F14 [P2] Fare Matrix Requires Row-Level Reconciliation

Evidence: exhaustive Domain consistency checks, official provider references.

All 912 nontrivial directed same-line matrix entries existed. All 7,803 ordered origin/destination/ticket quotes were finite, nonnegative, and internally summed correctly. However, reverse-direction comparisons produced **1,220 failing test cases**, representing **610 unordered pair/ticket comparisons**: 1,188 SVC cases and 32 SJT cases.

Examples: FPJ -> Balintawak SVC PHP 19 versus reverse PHP 16; Dr. Santos -> Ninoy Aquino SVC PHP 16 versus reverse PHP 19. These counts include cross-line combinations and repeated directional cases; they are not 1,220 distinct root causes. Reconcile matrix indexing and directional rules against official tables before changing fares. This audit has not visually checked every official matrix cell and does not claim every asymmetry is definitively unauthorized.

The current LRT-2/MRT-3 50% relief-policy implementation was checked by existing smoke tests. The provider page corroborates the effective March 23, 2026 policy; that does not independently verify every cell or rounding rule. No fare data was edited.

Sources: [matrix](C:/Users/Exelec/Downloads/TrainTracks/src/data/fareMatrix.ts:4), [policy](C:/Users/Exelec/Downloads/TrainTracks/src/data/farePolicy.ts), [LRMC official matrix](https://lrmc.ph/our-business-featured/fare-matrix/), [LRTA fares](https://www.lrta.gov.ph/tickets-and-fares/), [MRT-3 official reference](https://www.dotrmrt3.gov.ph/citizens-charter).

### F15 [P2] Trip/Admin Handler Validation Is Incomplete

Evidence: isolated actual-handler tests with mocked database/auth adapters, not production writes.

Unknown station/line/ticket values and an invalid started-at string reached the mocked trip upsert and returned 201. Null numeric PATCH values became fare=0 and distance=0, returning 200. Malformed admin-config JSON returned 200 and attempted an updated-at-only write. Real database constraints may reject some of these; the handlers themselves did not validate them.

Use explicit rail enums/catalog validation, real timestamp validation, finite bounded numbers without null coercion, and reject empty/invalid admin edits. Preserve verified-user ownership, which passed: a forged body user ID did not replace the authenticated owner.

Sources: [number coercion](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/trips/route.ts:36), [trip required-field check](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/trips/route.ts:77), [admin payload handling](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/admin/config/route.ts:55).

### F16 [P2] Offline Items Are Not Bound To Their Account

Evidence: Source/isolated queue inspection; no two-real-account production replay.

Outbox items have no owner/session identity. A queued trip is sent with the current browser session; the API assigns the current verified user. An account A trip flushed after signing into B can therefore be attributed to B unless the queue is bound/quarantined by owner. This is a source-backed cross-account integrity risk, separate from F07's reproduced deletion.

Source: [outbox item](C:/Users/Exelec/Downloads/TrainTracks/src/domain/offline/outbox.ts:9), [verified write owner](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/trips/route.ts:82).

### F17 [P2] Journey Reducer Accepts Older Trusted Samples

Evidence: Domain.

An older LOCATION_SAMPLE moved `lastTrustedFixAt` backward by 30 seconds. The upstream raw GPS filter rejects stale timestamps, which is good, but the reducer has no independent ordering guard. Restored/checkpoint or alternative input paths must not regress estimator time.

Validate monotonic sample ordering at the authoritative boundary, not only one producer.

Sources: [sample dispatch](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:747), [trusted timestamp assignment](C:/Users/Exelec/Downloads/TrainTracks/src/domain/journey/engine.ts:478).

### F18 [P2] Service Blocking Does Not Share The Prediction Calendar

Evidence: Source; no long-running midnight physical test.

The home gate uses browser-local hours and a universal 04:30-23:20 window. Predictions use Manila time and per-line/direction/day schedules. ClosedScreen replaces the entire journey screen, including an already active trip. The home Holy Week dates also differ from the prediction calendar and are hardcoded to 2026.

Use one Manila service-calendar contract. Prevent a time-window or remote status overlay from silently removing an active passenger's navigation/recovery controls.

Sources: [local clock](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useOperatingHours.ts:19), [closure replacement](C:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx:294), [holiday replacement](C:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx:275).

### F19 [P2] NAV Compass Permission/Unavailable State Needs Work

Evidence: Source, not an iPhone hardware test.

The orientation hook calls permission from an effect, not an explicit user gesture. Permission-gated platforms can reject that path. Missing heading rotates the transfer arrow to zero while the surrounding card still says Guidance Active. The orientation error is not presented by the compass consumer. The hook also directly references `DeviceOrientationEvent` without first checking its existence.

Expose permission/unavailable states, provide a user-gesture request on supported platforms, and preserve useful distance/sign guidance when no compass is available. Test absolute versus relative heading and magnetic/platform conventions on hardware.

Sources: [permission request](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useDeviceOrientation.ts:82), [zero-rotation fallback](C:/Users/Exelec/Downloads/TrainTracks/src/components/TripProgress.tsx:102).

### F20 [P2] Keyboard/Accessibility Gaps In Important Controls

Evidence: Frontend and Source.

FareSelector rendered no dialog role, left focus on the body, and did not close with Escape. StationInfoModal correctly opened with focus inside and closed with Escape, but its icon-only close button had no accessible name in the tested EDSA presentation. LineExplorer station targets are clickable divs rather than keyboard controls. Both bars have percentage text labels but no semantic progressbar role/value attributes. The viewport disables user scaling.

A screen-width overflow check is not a full contrast, screen-reader, keyboard-trap, or text-size audit. These need dedicated corrections and assistive-device verification without a design downgrade.

Sources: [fare overlay](C:/Users/Exelec/Downloads/TrainTracks/src/components/FareSelector.tsx:100), [unnamed modal close](C:/Users/Exelec/Downloads/TrainTracks/src/components/StationInfoModal.tsx:100), [station target](C:/Users/Exelec/Downloads/TrainTracks/src/components/LineExplorer.tsx:275), [viewport](C:/Users/Exelec/Downloads/TrainTracks/src/app/layout.tsx:32).

### F21 [P2] Several Cards Present Different Or Unverified Metrics As Facts

Evidence: Frontend and Source.

TripProgress labels accumulated `runningFare` as Total Fare; PHP 0 at origin is therefore coded behavior, not a full-trip quote. Its cross-line fare breakdown is a full quote, so the two numbers use different semantics. The arrival receipt uses straight-line distance and an estimated time at 30 km/h + two minutes, not recorded route distance/elapsed time. Transfer-point text is hardcoded from a line pair, not selected from the actual route edge.

The unauthenticated `/auth/verified` URL displays Account Verified / email confirmed without checking confirmation/session state. Profile setup renders without authentication; username availability ignores query errors and can mark a failed/offline lookup available. These are trust/error-state issues, not evidence of an authorization bypass.

Sources: [running fare label](C:/Users/Exelec/Downloads/TrainTracks/src/components/TripProgress.tsx:538), [receipt metrics](C:/Users/Exelec/Downloads/TrainTracks/src/components/TicketCard.tsx:454), [line-pair label](C:/Users/Exelec/Downloads/TrainTracks/src/components/TripProgress.tsx:50), [verified page](C:/Users/Exelec/Downloads/TrainTracks/src/app/auth/verified/page.tsx:6), [availability lookup](C:/Users/Exelec/Downloads/TrainTracks/src/app/profile/setup/page.tsx:45).

### F22 [P2] Realtime Crowd Recovery Has No Snapshot Reconciliation

Evidence: Source, with isolated deduplication tests passing.

Train presence subscribes to broadcasts and prunes stale entries, but does not fetch a retained presence snapshot on initial subscribe or reconnect. A commuter returning after a tunnel must wait for another reporter's new signal. Prediction and websocket paths also share `isPolling`/error flags, so HTTP completion can contradict the channel indicator.

Incident recovery is better: it reconciles on subscribe, online/visible changes, and a minute interval. However, incident-vote UI says Vote recorded before server confirmation, and failed votes may later expire/reject. Model pending/retry/confirmed distinctly.

Same-sample crowd-service testing produced two record attempts but **one broadcast**, with the second response marked duplicate. Existing clustering/deduplication smoke tests passed. This does not prove production RPC claim concurrency, multi-tab storage races, or reconnect correctness; no fabricated production report was submitted.

Sources: [broadcast-only listener](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTrainPolling.ts:63), [vote optimistic state](C:/Users/Exelec/Downloads/TrainTracks/src/components/ServiceDisruptionBanner.tsx:47), [incident reconciliation](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useIncidentListener.ts:44).

### F23 [P2] Profile Upsert And Shipped Grants Need A Contract Test

Evidence: Source/migration comparison, not an authenticated production write.

`updateProfile` upserts public profile data including `updated_at`. The security migration grants authenticated INSERT on id/username/display_name/avatar_url but not updated_at, while allowing updated_at for UPDATE. A Postgres upsert requires privileges on inserted columns even when it may take the conflict-update path. Test this combination against an isolated database with the shipped grants before declaring profile edits/onboarding healthy. [PostgreSQL INSERT privileges](https://www.postgresql.org/docs/current/sql-insert.html).

The anonymous admin RPC returned false successfully, but that does not establish every deployed grant matches the checked-in migration. No role or `is_admin` change was made. Server authorization uses `user_roles` through the RPC, not a client-editable developer flag.

Sources: [profile upsert](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useAuth.ts:270), [column grants](C:/Users/Exelec/Downloads/TrainTracks/supabase/20260809_security_reliability.sql:113), [server role check](C:/Users/Exelec/Downloads/TrainTracks/src/domain/auth/admin.ts:17).

### F24 [P3] Diagnostics, History, Docs, And Admin Controls Need Cleanup

Evidence: Source plus frontend/isolated checks where noted.

| Issue | Observation / consequence | Source |
| --- | --- | --- |
| Token Last Used | The update query is constructed but never awaited/consumed. Fixture consumed-query count did not increase. | [apiAccess.ts](C:/Users/Exelec/Downloads/TrainTracks/src/domain/predictions/apiAccess.ts:184) |
| API configuration | Commit/API Enabled writes localStorage only; server behavior is not changed by those controls. Do not present it as global configuration. | [ApiConsole.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/ApiConsole.tsx:685) |
| History totals | Recent statistics initially cover three fetched trips; View All covers at most 100, not lifetime totals. Non-OK reads become empty lists. | [useTripHistory.ts](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTripHistory.ts:74) |
| History repair | Viewing history can trigger PATCH repair requests through the hook, even though the modal itself does not mutate. Production browser writes were blocked in this audit. | [useTripHistory.ts](C:/Users/Exelec/Downloads/TrainTracks/src/hooks/useTripHistory.ts:63) |
| Retry completion time | Trip upsert generates completed_at on every request, so retry can change completion ordering/date instead of preserving actual arrival. | [trips route](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/trips/route.ts:97) |
| Default history limit | Number(null) becomes 0 then clamps to 1, not the apparent intended default 3. Current UI sends explicit limits. | [trips route](C:/Users/Exelec/Downloads/TrainTracks/src/app/api/trips/route.ts:52) |
| LineExplorer follow | handleScroll is not attached; line-tab changes do not start the same inactivity timer. Timer cleanup also needs review. | [LineExplorer.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/LineExplorer.tsx:103) |
| Reconnection time | The visible loss timer starts at banner mount, not last trusted GPS fix. The Wi-Fi icon represents a GPS condition, not mobile-data diagnosis. | [ReconnectionBanner.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/ReconnectionBanner.tsx) |
| Zero distance | Falsy distance-to-next forces Destination header; 0 is treated as missing. | [TripProgress.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/TripProgress.tsx:291) |
| Documentation encoding | Visible mojibake, including `v1` separator and dash sequences, reproduced on `/docs`. | [ApiDocs.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/ApiDocs.tsx:143) |
| README drift | Next 14/React 18/Node 18/Turf text does not describe installed Next 16/React 19 stack. | [README.md](C:/Users/Exelec/Downloads/TrainTracks/README.md:41) |
| Security guard | Desktop blocking works, but size-gap/debugger heuristics can falsely lock a handheld browser and are not server authorization or a way to hide client JS. Real mobile browser UI sizes remain untested. | [SecurityGuard.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/SecurityGuard.tsx:32) |
| Capability promises | Welcome claims accelerometer fusion and guaranteed locked-screen alerts; the audited runtime does not establish either. | [WelcomeScreen.tsx](C:/Users/Exelec/Downloads/TrainTracks/src/components/screens/WelcomeScreen.tsx:92) |

### Provider Availability Risk: Attribution Removal

The requested local change produces zero Leaflet attribution controls and does not replace the basemap. However, CARTO requires visible linked OpenStreetMap/CARTO attribution and can suspend noncompliant keys. A hidden key does not remove that requirement. An integrated transparent credit treatment would address the original white-strip complaint without changing the map. This is a provider-compliance issue, not a recommendation to adopt another map. [CARTO attribution](https://carto.com/attribution/), [CARTO basemap terms](https://www.carto.com/legal/basemap-terms/), [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

## Verification Summary

| Check | Result | Boundary |
| --- | --- | --- |
| Existing journey, train presence, incident, prediction, station image, logic-rebuild smoke suites | All six passed | Bus suite deliberately not run |
| TypeScript, noEmit/no incremental output | Passed | Static typing, not runtime correctness |
| ESLint | 0 errors, 181 warnings across 229 files | Several rules are warnings; not a clean bill of health |
| Production build | Passed, including 13 static pages and PWA output | Windows sandbox EPERM required an authorized retry; middleware deprecation remains |
| Live rail station inventory | 51 stations | MRT-7 excluded from public live network |
| Ordered route pairs | 2,601 passed structural invariants | Includes same-origin/destination pairs |
| Fare quotes | 7,803 finite/nonnegative/consistent totals | Reverse-fare checks failed as detailed in F14 |
| Same-line matrix coverage | 912 directed nontrivial pairs present | Official cell-by-cell verification outstanding |
| End-to-end reducer replays | 14 arrived at intended destination, totalProgress=100, no whole-trip regression | Exact path-interpolated fixes; not physical GPS recordings |
| Catalog-coordinate adjacent-leg probes | Failures in F01 | Critical distinction from path-perfect replays |
| NAV walking mounted UI | Passed increasing top bar/distance/handoff | One mounted EDSA -> Taft walk; all interchanges not physically walked |
| Arrival receipt and END TRIP | Passed visible arrival and reset | Final notification failed; no real history write |
| Dark/light toggle | Passed state and dark/voyager URLs | CARTO production tile proxy supplied read-only fixtures; local key absent |
| Warm offline home and explorer | Passed in clean new-page probe | No guarantee for unvisited pages/tiles or expired auth |
| Desktop phone restriction | Correctly displayed handheld-device-required | Desktop 1440x900; no device-spoofing security claim |
| Mobile document overflow | None at 360x640, 390x844, 412x915, 844x390 in sampled states | Not every text/font/overlay combination |
| Final route/frontend pass | Eight secondary routes rendered, no captured page errors | Anonymous route states only |
| Isolated API/auth handlers | 21/24 expected results passed; 3 validation failures | Database/auth adapters mocked |
| Same-sample crowd broadcast | One broadcast for two submissions | RPC claim/storage mocked; no production write |
| Production/internal HTTP observations | 88 across initial/local/production matrix and supported rail queries | Some initial unknown query names exercised parser defaults; correct lineId/stationId queries were run separately |
| Fixed-time station forecast cases | 408 passed shape, line, direction, scope, limit checks | 51 stations x 2 directions x 4 dates; schema checks are not ETA ground truth |

The 14 replays covered full/extension LRT-1 both directions, LRT-2 both directions, MRT-3 both directions, and six cross-line scenarios, including two-transfer journeys. They establish useful route/reducer coverage but must not conceal F01's real-coordinate failures.

## Every Card: Coverage Ledger

Numbers correspond to the detailed card reference. **Partial** means some behavior was exercised, not that every branch passed. **Source** means reviewed, not executed through every interaction. **Restricted** means success/mutation paths need isolated accounts/backend or real hardware.

| # | Card / presentation | Coverage and result |
| --- | --- | --- |
| 1 | TicketCard locating/GPS error | Location diagnosis unit cases passed; denied/checking UI sampled. Real OS permission retry/timeout matrix outstanding. |
| 2 | Nearest/detected station | Mounted boarding threshold at EDSA; selection passed. Coordinate/path mismatch affects post-boarding trust. |
| 3 | Transfer-area choices | EDSA/Taft candidates/distances and chosen origin passed. Every interchange jitter envelope not replayed in mounted UI. |
| 4 | Current/approaching/leaving card | Labels, bars, neighbors reviewed; path-perfect replays passed. False departure/dwell and catalog anchors failed. |
| 5 | UpcomingTrains | Waiting/empty state rendered; filters/ETA/click reviewed. Station forecasts are discarded; service/error distinctions need work. |
| 6 | TripProgress summary | Whole-route metrics exercised in reducer; mounted speed/fare/arrival branches sampled. Running-fare semantics and fallback channel fail expectations. |
| 7 | NAV MODE | Mounted EDSA -> Taft bar/distance/handoff passed; six cross-line reducer replays passed. Poor transfer fix failed; hardware compass outstanding. |
| 8 | Arrived summary | Receipt visible; END TRIP reset passed. Final notification failed; metric semantics and auto-close race require fixes/tests. |
| 9 | LineExplorer | Rendered mobile timeline; station-modal click passed. Direction behavior/source reviewed; keyboard targets and browsing timer need work. |
| 10 | Spectator empty | Mounted spectator mode and active count presentation exercised. Count is model/store entries, not physical fleet size. |
| 11 | Spectator selected train | Source/presence-model checks; selection/following not exhaustively driven with live feed. CPU profile and prediction replacement failures affect this flow. |
| 12 | Spectator selected station | Source and station forecast coverage; all row/ETA interactions not mounted. Station-scope exclusion remains. |
| 13 | StationInfoModal | EDSA opened, focus inside, Escape closed. Image data smoke passed; all-image-failure rendering not independently exercised here. Close button unnamed. |
| 14 | RecentTrips | Source and history handler fixtures. Restricted: real authenticated successful reads/saves not exercised. |
| 15 | TripHistory and trip cards | Grouping/expansion/stat logic reviewed; query cap/repair side effects identified. Restricted: account-bound history UI not exhaustively mounted. |
| 16 | WrongDirectionAlert | Evidence utility smoke passed; safe-repair handlers reviewed. Mounted repair/cancel matrix remains outstanding; destination reset issue found. |
| 17 | CongestionAlert | Model/time smoke coverage; visibility/dismiss reviewed. Live custom config unavailable due schema mismatch. |
| 18 | Stall possible-disruption | Detector/service smoke/source; report buttons not submitted to production. Timer/classification UI still needs isolated mounted fixtures. |
| 19 | Stall confirmed delay | Source/domain coverage; dismiss branch not exhaustively mounted. No operator-resumption guarantee. |
| 20 | Disruption/incident cards | Incident aggregation smoke and GET passed; reconnect reconciliation exists. Vote optimistic state reviewed; no real vote sent. |
| 21 | ReconnectionBanner | GPS fallback condition reproduced; developer suppression unit check passed. Displayed age semantics need correction. |
| 22 | GPSFallbackHandler | Source/diagnostic cases; developer simulation action not a real GPS recovery test. |
| 23 | GPS fallback indicator | Mounted DR state; indicator alone does not fix the shared map/speed mismatch. |
| 24 | Pre-board safety | Eligibility rules/source and journey tests reviewed; can be suppressed by F01 uncertainty. Two-second stable timer not certified on real rides. |
| 25 | In-transit safety | 45 s/120 m/8-82%/five-second-stability contract reviewed. Long signal gaps/short legs/reroute timers need real and isolated UI tests. |
| 26 | Crowd consent | Source/payload/privacy gating reviewed; default OFF visible. No fabricated live reporting enabled. |
| 27 | Fare/destination selection | Actual EDSA/SJT/Magallanes configuration passed. Escape/focus failed; amendment behavior regresses station/progress. |
| 28 | NotificationSettingsModal | Not mounted. Notifications are nevertheless accessible through MainApp's Alerts tri-state menu; the dormant modal is not proof settings are missing. |
| 29 | Profile drawer/stat tiles | Source; anonymous profile surface sampled. Restricted: signed-in drawer actions/data/partial failures. |
| 30 | Profile setup/edit | Route rendered; validation/storage code reviewed. Username-error/grant contracts need work; no avatar/profile writes. |
| 31 | Auth/password/email/login success/logout | Anonymous screens rendered; four callback redirect fixtures passed. Restricted: full Google/PKCE/cookie/email/reset/logout success cycle. |
| 32 | Welcome/information tiles | Source and initial onboarding render sampled. Sensor/background promises exceed evidence. |
| 33 | Blocking/status/error screens | Desktop gate and normal mobile routes passed; maintenance schema failure confirmed. Closure/calendar, region boundaries, false-positive security lock still need fixtures/hardware. |
| 34 | CommandCenter/simulation | Simulation engine smoke passed; actions reviewed. Restricted: real admin unlock/config writes; no remote maintenance changed. |
| 35 | Dev GPS monitor | Source; shared-channel inconsistency established from stores. Diagnostic numbers alone are not authoritative. |
| 36 | Dev zones monitor | Source; older heuristics must be reconciled with new reducer thresholds. |
| 37 | Dev trip monitor | Source; store/view agreement tested through fixtures, not complete privileged-panel interaction. |
| 38 | Dev event log | Source/local bounded-log behavior reviewed; no durable backend audit-log claim. |
| 39 | API summary/per-line/rush cards | Anonymous gate rendered; underlying GETs/model tested. Restricted: actual privileged card rendering/count/error actions. |
| 40 | API crowd/stall/incident cards | Source and underlying domains; successful production event reception not stimulated. Session counters are not all-time totals. |
| 41 | API token cards/dialogs | Missing/valid fixture/scope/origin auth checks; Last Used failure. Restricted: real list/generate/copy/revoke. |
| 42 | API playground | URL/parser/actual supported rail GET checks passed. Privileged mounted Run/Copy interactions outstanding. |
| 43 | API CLI polling | Source/timer/100-log limit reviewed; mounted privileged start/stop/load cleanup outstanding. |
| 44 | API config/docs | Local-only config behavior identified; docs route visually reproduced encoding errors. No remote commits. |
| 45 | NearbyStationsCard | Not mounted; no production behavior credit assigned. |
| 46 | TrackingCard | Not mounted; legacy fixed labels not treated as current trip UI. |
| 47 | InfoCard | Not mounted; passive prop display only. |
| 48 | StationTimeline | Not mounted; not the current LineExplorer. |
| 49 | GeofenceScanner | Not mounted; its alternate threshold does not define current boarding behavior. |
| 50 | DevControls | Not mounted; legacy simulator not a tested live feature. |
| 51 | DevDashboard | Not mounted; legacy GPS override not the mounted command center. |

Additional frontend surfaces checked: settings dark/light toggle and map URLs, root companion/spectator switching, phone restriction, auth/admin route gates, map/markers in sampled screenshots, and responsive document dimensions. Rush Hour/Alerts/Crowd menu wiring was read; every settings-cycle/permission branch was not claimed as an executed pass.

## API Coverage And Trust Boundary

| API family | Observed result | Not established |
| --- | --- | --- |
| Internal predictions | Supported map/station queries for all three lines and both directions returned 200, valid finite payloads, limits respected, no-store. Late-night empty arrays aligned with closed/passed service states; LRT-1 also returned nonempty examples. | Physical ETA accuracy, operator ground truth, peak-load/server cost, full malformed-parameter expectations |
| Prediction model | 408 station/direction/date cases passed basic schema/scope/limit checks; existing prediction smoke passed. | Forecast errors measured against real train arrivals |
| Internal SSE | 200 text/event-stream and named predictions event captured, connection aborted afterward. | Sustained cadence, heartbeat/backpressure, Vercel lifetime limits, repeated reconnect under loss |
| Public GETs/stream | Production missing-token 401; untrusted OPTIONS did not grant CORS. Local missing-config 503 was distinguished from a production failure. | Successful real token, expired/revoked real token, distributed rate limiting, production valid-origin preflight |
| Public authorization fixture | Missing/query-only 401, valid DB fixture allowed, wrong scope/origin 403. | Real DB permissions/availability, token revocation propagation |
| Crowd presence | Actual service repeated-sample fixture: duplicate recognized, one broadcast. Existing train-presence tests passed validation/clustering behavior. | Production RPC migration/concurrent claims, multi-tab contention, broadcast reconnect/replay |
| Stall and incidents | Existing incident smoke passed; bounded active incident GET worked. Incident listener has reconciliation logic. | Successful live report/aggregation/vote persistence, all optimistic UI error/retry paths |
| Trips | Anonymous GET/POST/PATCH fixture denied; forged owner ignored; required fields rejected; identified validation/default-limit issues. Live anonymous GET 401. | Real successful account storage, RLS/idempotency under concurrent retries, UI history updates |
| Admin auth/config/tokens | Live anonymous admin auth 401 and config/token reads 403. Non-admin denied in fixture; admin allowed in fixture. | User's Google round trip, actual admin role/session expiry, successful privileged CRUD, token generation/revocation |
| Auth callback | Admin return, hostile external next, recovery, signup fixtures selected correct destinations. | Cross-host PKCE verifier cookies, Google/Supabase allowlist, recovery emails, Safari cookies, user's account role |
| Map tile proxy | Production PNG returned; invalid style/zoom/tile ranges 404/no-store; local key absence produced 503. Mounted map used same-provider tile responses. No CARTO key-prefix match found in src/public/compiled static assets. | Provider quota, key rotation/restrictions, all zoom/retina/cache-error combinations, legal attribution compliance |

Two important interpretation rules: first-party anonymous read endpoints are not proof of an auth defect; privileged successful mocks are not proof production role grants or OAuth are healthy. Likewise, `isDevMode` is presentation state, not server administrator authority.

## Frontend / Offline / Mobile-Data Observations

Screenshots were inspected for the actual transfer card, arrival card, dark/light map, anonymous admin gate, docs, reset page, and sampled mobile layouts. The transfer text and bar were visible and aligned in the inspected portrait state. No full-document horizontal overflow was measured in the sampled dimensions. This does not guarantee every transient card, long station name, overlay, and font-size setting fits.

The docs header has awkward wrapping and visible mojibake. Reset/verified/profile routes render, but their authenticated success and error branches were not proven. Some captures were intentionally taken during animations; apparent low opacity in an early capture is not automatically a persistent CSS defect.

The PWA build produced a controlling service worker, a start-url cache, and 95 precache entries. Clean new-page offline probes rendered previously warmed `/` and `/explorer`. An earlier same-page transition probe retained the previous page; the clean probe supersedes that as evidence of home availability. An unvisited `/login` failed offline. Tiles/images outside the warmed cache remain unavailable without data, and foreground GPS estimation is not a guarantee of background notifications.

Current cache limits: map tiles 180 entries/seven days, static assets 90/30 days, station images 60/30 days, pages 12/one day. Auth/private navigation cache handling and update-during-trip behavior need explicit tests; no private-data cache leak was established here.

A sampled cold spectator workflow had about 2.31 MB transferred and 3.59 MB decoded resources. A separate multi-step frontend workflow had 81 requests and about 1.24 MB recorded transfer bytes; these captures have different duration/cache/provider fixtures and are **not directly comparable**. Local tile failures affect measurement; neither is a per-hour mobile-data bill or real handset battery result.

Existing mobile-data-positive behavior includes adaptive polls, hidden/offline HTTP suppression, same-origin tile caching, saver-mode non-retina tile URLs, crowd heartbeat/change checks, and queued retry/backoff. The one-second full client prediction rebuild is not data traffic, but it is a substantial CPU/battery risk. The saver/auto profile is read when effects start; live Network Information changes do not independently reschedule the timer.

No visual proof of every GeoJSON pan/zoom condition is claimed. Sampled maps/markers rendered with CARTO; the reported intermittent overlay drift requires a dedicated repeated pan/zoom/orientation/device replay. Station/path data mismatch in F01 is a separate confirmed geometric issue and should not be conflated with a canvas transform bug.

## Recommended Order For A Later Fix Pass

1. Repair station/track endpoint projection and add catalog-coordinate regression fixtures on every directed rail leg. Keep the existing reducer as the single authority; do not introduce a second competing trip engine.
2. Connect its estimated location/speed/source to all visual consumers; fix final-arrival events and stable dwell recovery. Add noisy/stale/signal-loss recovery replays and ensure estimates never impersonate observed crowd truth.
3. Implement atomic journey amendments and owner-bound durable history/outbox handling. Preserve trip identity, elapsed time, and confirmed cursor when changing a ticket/destination.
4. Reconcile backend configuration/grants with the app contract in isolation, then apply reviewed production migrations only with explicit authorization and intended maintenance state confirmed.
5. Remove duplicate prediction authorities and optimize the measured dispatch/time-formatting work. Benchmark before/after with visuals unchanged, then profile geometry, React subscriptions, map animation and compositing separately.
6. Reconcile fare cells and policy/rounding against versioned official matrices. Make accumulated/full-quote/paid fare and measured/estimated receipt statistics explicit.
7. Have Fable address the presentation contracts: recovery prompt, uncertain NAV/compass state, pending/confirmed reports, empty/loading/error/service states, accessible modals/controls/bars, and truthful fare/receipt labels. Retain the map-first layout, colors, motion and existing design quality.
8. Complete isolated auth/admin/profile/token/stall/history success-path tests, then real-device commuter trials before release. Do not combine the audit with an unreviewed deploy or force dependency fix.

## Remaining Release Checks

These are genuinely outstanding, not silently marked passed:

- Recorded noisy GPS rides in both directions on each line, actual platform offsets, deceleration/dwell, tunnels, urban-canyon drift, long loss/reacquisition, and transfer walkways/stairs.
- Low-end Android and iOS/Safari/PWA, real orientation permission, unsupported sensors, background/screen lock, OS process eviction, battery drain, data use, memory/thermal throttling, and 30/60 Hz device frame budgets.
- Mounted safety timers, wrong-direction repair, congestion/stall/report/vote branches, automatic arrival close and immediate new-trip races, every modal focus/cancel/error branch, and assistive-device contrast/text-size navigation.
- Two isolated real accounts for owner-bound history/outbox, actual admin and non-admin identities, OAuth across canonical/preview hosts, refresh/expiry, Google password metadata, reset/email/username/avatar partial failure and storage grants.
- Isolated database migration/grant contract, concurrent crowd claims/stall votes, idempotent history, real API tokens/scopes/origins/revocation, bounded load/rate limits/SSE reconnect, and API docs contract parity.
- Repeated map pan/zoom/resize with station/train markers and all rail geometry, retina/non-retina caches, service-worker upgrade while a trip is active, and offline routes/tiles not previously visited.
- Official fare matrix transcription/rounding, changing service/holiday calendars, and attribution/provider quota/key restrictions.

## Evidence Files

All local harnesses and detailed outputs are in the ignored directory [audit-20261008](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008). They contain controlled fixtures/sanitized observations, not a new production test suite.

| Evidence | File |
| --- | --- |
| Route/fare/replay/station anchors | [domain-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/domain-results.json) |
| NAV, DR, arrival, theme frontend | [frontend-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/frontend-results.json) |
| Prediction race, keyboard, routes, healthy-SW CPU retest | [final-frontend-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/final-frontend-results.json) |
| Full CPU samples | [cpu-profile.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/cpu-profile.json) |
| Trip amendment regression | [trip-edit-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/trip-edit-results.json) |
| API/auth isolated handlers | [api-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/api-results.json) |
| Supported rail GETs and 408 model cases | [rail-api-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/rail-api-results.json) |
| Bounded HTTP/SSE/auth/tile checks | [network-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/network-results.json) |
| Backend configuration read | [backend-read-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/backend-read-results.json) |
| Outbox/checkpoint/poor transfer fix | [recovery-outbox-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/recovery-outbox-results.json) |
| Clean offline cached-page probe | [offline-probe-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/offline-probe-results.json) |
| Initial offline/performance fixture | [offline-performance-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/offline-performance-results.json) |
| Dependency advisories | [dependency-results.json](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/dependency-results.json) |
| Actual NAV card | [front-nav-walking-390.png](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/front-nav-walking-390.png) |
| Transfer handoff | [front-transfer-handoff-390.png](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/front-transfer-handoff-390.png) |
| Arrival receipt | [front-arrival-390.png](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/front-arrival-390.png) |
| Docs frontend defect | [checked--docs.png](C:/Users/Exelec/Downloads/TrainTracks/.tmp-edge-debug/audit-20261008/checked--docs.png) |

Test-fixture exclusions: Workbox errors produced by deliberately blocked service workers, virtual-clock GPS watchdog artifacts, and the interrupted browser rerun are not classified as application failures. The final mounted frontend pass captured no page errors, and the healthy-service-worker performance rerun independently confirmed the CPU issue.
