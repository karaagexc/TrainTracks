# TrainTracks Reliability Repair Verification

Date: 2026-10-09, Asia/Manila. Train-focused repair; bus redevelopment excluded.
Verification resumed on 2026-10-10; simulator follow-up on 2026-10-11, Asia/Manila.
This is a working release ledger, not a claim of flawless real-world operation.

## Current Verdict

The repaired journey logic passes the route, station, progress, stopping, GPS,
estimation, amendment and recovery regressions described below. A second,
independent read-only audit identified six additional issues; their fixes are
tracked separately below. Production release remains gated on preview, database,
authentication, frontend and deferred-control requirements. No production SQL or
maintenance setting has been changed by this repair run.

The detailed **51-card/panel function inventory** remains in
`TRAINTRACKS_CARD_REFERENCE_2026-10-08.md`. The original findings and historical
failure evidence remain in `TRAINTRACKS_TRAIN_AUDIT_2026-10-08.md`; they are not
rewritten to imply the old revision worked.

## The Bars And Four Train States

| Surface | Authoritative behavior | Verification boundary |
| --- | --- | --- |
| First card, ordinary rail journey | Adjacent-station `legProgress`; resets at a confirmed stop | Reducer and mounted rendering fixtures; physical ride still required |
| First card, NAV rail leg | Cumulative `railLegProgress` across the current rail segment toward its transfer/leg endpoint; intermediate stops do not erase it | Multi-stop/cross-line regressions and mounted replay pass; physical interchange validation pending |
| First card, walking transfer | Active transfer progress, capped below 100 until two accurate, fresh target fixes at least 3 seconds apart; off-corridor fixes cannot advance it | All route-transfer reducer replays and explicit bad-accuracy/off-corridor cases |
| Lower journey bar | `totalProgress` across the full route, including transfers and traversed history | 14 full-trip replays and amendments; a longer amended route may reduce percentage without deleting traveled distance |
| CURRENT STATION | `AT_STATION`, including origin and confirmed intermediate dwelling | Native stop handling, catalog anchors, two-sample confirmation, false-departure recovery |
| NOW LEAVING | `LEAVING_STATION` after motion away from the station | Rail-phase fixtures; speed and location share one effective sample |
| IN TRANSIT | `BETWEEN_STATIONS` on the active rail edge | Rail-phase and route replay fixtures |
| NOW APPROACHING | `APPROACHING_STATION` near the next station; same-edge status latch resists boundary jitter | Accepted 20 m-accuracy fixes on both sides of the approach boundary retain the approach label |

Confirmed stopping can reset the status latch; it does not permanently force an
approach label. Estimated positions cannot confirm the final arrival, feed back
as GPS, or qualify as crowd/stall evidence. Dead reckoning preserves a confirmed
dwell rather than inventing movement during signal loss.

## Original Findings To Regression Cases

"Implemented/tested" means the listed code/fixture checks passed, not that every
hosted or physical-device branch has been certified. "Partial" is an open gate.

| ID | Regression case and repair | Status / primary evidence |
| --- | --- | --- |
| F01 | Real station anchors on clipped validated rail paths, shared journey/prediction geometry; no straight-chord fallback may disguise a missing rail path | Implemented/tested: `test:reliability`, all 96 directed catalog legs |
| F02 | Effective GPS/DR/recovery location and speed agree across stores; raw sensors remain separate | Implemented/tested: journey/reliability and frontend effective-sample fixtures; physical tunnel reconciliation pending |
| F03 | Final notification only from `ARRIVED`, keyed by trip/event, not approaching label; failed/pending delivery is not an acknowledged event | Implemented/tested: mobile constructor failure, worker-ready retry, pending/ACK deduplication, haptics once, denial/rejection/mute fixtures; background OS delivery not guaranteed |
| F04 | Persisted versioned API/congestion/public-enable settings, acknowledged values, explicit schema degradation | Implemented/tested in API fixtures and isolated PostgreSQL; production migration pending |
| F05 | Cache formatter/dispatch/timeline/geometry inputs; bounded offline work in a real worker, never a second live prediction writer | Implemented/tested: prediction and browser-worker suites; normal frame target observed, throttled performance target remains open |
| F06 | Explicit begin/amend, stable trip/time identity, preserve active edge and traversed prefix; fare edit is not a restart | Implemented/tested: store/reducer amendment and checkpoint regressions |
| F07 | 401 pauses history replay; transient errors retry; forbidden/invalid data quarantines; failed enqueue retains the receipt | Implemented/tested: offline suite, quota/transaction/owner fixtures; new retry/discard controls deferred to Fable |
| F08 | Next/config 16.4.0, PostCSS 8.5.29, Tailwind 3.4.19 and compatible serialization patch | Partial: build passes; npm audit still reports 8 high and 2 moderate dependencies, no forced major upgrades |
| F09 | Immediate native stop, two fresh low-motion fixes, recover false departure, retain dwelling during signal loss | Implemented/tested: real-catalog station replays and stopping/DR cases |
| F10 | Both transfer completion radii need acceptable accuracy and two fresh samples >=3 s; walking corridor validation prevents poisoned high-water progress | Implemented/tested: poor/null accuracy, long-gap, off-corridor, target and manual edge guards |
| F11 | Checkpoint v2 validation, safe legacy migration, 20-minute auto / six-hour confirmation boundary / expiry | Partial: storage and parser tests pass; confirmation interface remains Fable deliverable |
| F12 | One HTTP prediction authority, 1 s foreground spectator/active rail polling in every phase; hidden/offline pause, no overlap, backoff, Retry-After, obsolete-response rejection | Implemented/tested: prediction/crowd suite and mounted retention through one-second ticks; real slow-network cadence is not guaranteed |
| F13 | Station forecasts retained separately from map trains, crowd-first platform priority, explicit forecast/service/loading/error states | Implemented/tested: platform/static-render fixtures and mounted prediction branches |
| F14 | Directed fare reconciliation and policy metadata; don't assume reverse fares match or compound discounts | Partial: 912 directed pairs, 2,136 base/effective cells verified against fixtures; 600 LRT-1 concession cells remain unverified, explicitly labeled |
| F15 | Strict catalog/enum/timestamp/bounded-number validation, empty/malformed rejection, original completion time wins retries | Implemented/tested: API/auth fixtures and actual isolated PostgreSQL retry/ownership tests |
| F16 | Owner-bound outbox v2; never send A's history as B; quarantine legacy/unowned records | Implemented/tested: account switch, auth pause, quarantine, cross-tab lock and real PostgreSQL ownership cases |
| F17 | Reject invalid/out-of-order inputs and estimated feedback; live runtime ignores stale real GPS | Implemented/tested: journey/GPS regressions; sensor/browser clock behavior pending hardware QA |
| F18 | Shared Manila-time service calendar; closures/maintenance preserve an existing journey/recovery/receipt | Implemented/tested: service and UI fixtures; hosted configuration migration pending |
| F19 | Compass prompt/denied/unavailable states explicit; no permission request from an effect | Partial: orientation and existing fallback text repaired; gesture permission control is a Fable deliverable, iOS hardware check pending |
| F20 | Existing dialog focus/Escape, named controls, keyboard stations, bar ARIA semantics, readable attribution | Implemented with fixture coverage; whole-product assistive-technology/long-text matrix not certified |
| F21 | Correct quoted vs incurred fare, measured receipt distance/time, route-derived instructions, zero distance, uncertainty and freshness | Implemented/tested: route-fare and static-render fixtures; reversal-within-paid-rail quote is unverified, not a certified free fare |
| F22 | Crowd snapshot on subscribe/reconnect, observation timestamps, sample identity dedup, serialized cross-tab submission, HMAC/private-field redaction | Implemented/tested: browser leases, unit receiver/snapshot and actual PostgreSQL concurrency; hosted WebSocket transport pending |
| F23 | Permitted profile columns and server timestamp trigger; SSR cookie/PKCE/origin/role contracts | Implemented/tested: isolated handlers and PostgreSQL privileges; user-assisted Google round trip pending |
| F24 | Read-only paginated history/totals, no auto repricing; follow timer, docs/config acknowledgements, handheld gate and deterrents without debugger/size lockouts | Implemented with partial UI fixtures; privileged mounted success branches not certified |

## Second Audit Findings

The independent audit was read-only and made no production calls or edits. Its
isolated reproductions exposed these additional regressions:

| Case | Reproduction | Repair / current verification |
| --- | --- | --- |
| R25 | Checkpoint read throws, then pagehide/cleanup deletes its stored value | Reads carry success separately from value; no persistence before initialization or after unknown checkpoint reads. `test:persistence` passes read-error and pending-hydration lifecycle tests |
| R26 | Grant crowd consent, enqueue GPS, withdraw consent, then flush | Consent-aware cancellation, in-flight abort and enqueue/flush race checks pass. Missing/unknown/unreadable saved consent fails closed; storage removal/clear revokes the live grant too. Owner history continues unchanged; cleanup failures are surfaced. Independent final recheck found no remaining missing-key reproduction |
| R27 | Accurate GPS ~1.88 km off an EDSA/Taft transfer projects to its endpoint | Transfer corridor validation rejects the sample as UNCERTAIN without changing either progress bar or trusted-fix time. `test:reliability` passes |
| R28 | Accepted GPS fixes jitter 20 m across rail approach boundary | Same-edge rail status latch prevents approach/transit/approach oscillation; confirmed stop still recovers. `test:reliability` passes |
| R29 | Waiting worker is offered before checkpoint hydration completes | MainApp requires hydration; mounted waiting-worker fixture passes. Activation also rechecks fresh store state before/after async cleanup, not only a stale React effect ref; offline regressions pass |
| R30 | Public CORS wildcard advertises open access but rejects a valid external token | Scoped CORS suite passes unrestricted public prediction GET/OPTIONS/stream, restricted token origins/scopes and same-origin internal/write isolation; no credentialed wildcard. Console/docs describe the narrow read-only contract |
| R31 | Unchanged polling recreates station icons and interrupts moving-train interpolation/pulse identity | Cache station icon options and stable positions/handlers; derive motion appearance from fresh native train state, not coordinate deltas. Unit checks and mounted object/inner-DOM/800 ms interpolation probes pass without removing animations |
| R32 | Native wheel/keyboard/pinch pauses camera but canceled or zoom-limit gestures emit no Leaflet end event | Native intent cancels queued automatic camera work; fallback timer and touch end/cancel preserve ten-second resumption. Fresh production replay covers changing GPS, zoom-limit wheel and stationary two-finger touch; real physical pinch remains pending |
| R33 | Begin/reset can overwrite a pending recovery candidate | Both commands preserve pending recovery; explicit discard/resume is required and unit guards pass. **Open P1 release gate:** the 20-minute-to-six-hour recovery candidate has no mounted decision control yet, so a commuter cannot resolve this state until Fable's recovery interface is integrated |
| R34 | Canonical short production origin omits the user's long project alias from callback validation | Accept only the two verified production aliases, canonical configured origin, platform production origin and explicit extra allowlist. Handler fixtures cover both production aliases and reject an arbitrary generated preview; real Google round trip remains pending |
| R35 | Mounted LRT-2 simulator triggers caught React error 185 before its first movement tick | Timestamp simulated coordinates at input, not during render; isolate simulation memo inputs from estimator output. Mounted button replay checks the error boundary explicitly, shared sample timestamps, bounded updates and pause/resume |
| R36 | Switching active scenarios amends the old origin; Play can claim an existing real journey and bypass scenario guards | Explicit new-scenario reset/begin with stable simulator-owned trip ID. Play/scenario commands cannot take over real trips, pending recovery or retained receipts. Mounted replay covers switching and native-trip isolation |
| R37 | Reset can re-enable the GPS override; completed replay can reuse the old trip, and old interval work can affect its replacement | Remove redundant render-effect override activation; pause/reset clears the input clock. Interval work is bound to its captured trip ID and fresh mode flags. Owned ARRIVED replay explicitly starts a new trip; mounted replay waits past the old receipt timer |

## Executed Checks

- `npm run test:train`: eleven train-focused suites pass, including the original six and expanded reliability/offline/persistence/notification/map-icon coverage. Latest complete run includes pending-recovery guards, 96 directed legs, 2,601 route combinations, 7,803 fare quotes and 14 full trips. Bus suite deliberately excluded.
- `npx tsc --noEmit`: passes. Production build also completed its TypeScript check.
- `npm run build`: optimized webpack production/PWA build passes, 13 static pages. Windows sandbox EPERM required an authorized host retry; middleware convention deprecation remains.
- `scripts/api-auth-repair-smoke.mjs`: passes isolated handler/session/role/profile/config/validation contracts; not a Google OAuth round-trip.
- `scripts/prediction-crowd-repair-smoke.mjs`: passes HTTP-authority, metadata, retry/config and sample/privacy contracts. Latest 100 warm responses took about 265 ms total with two Intl formatters; this is not browser frame time or a server-cost guarantee.
- `scripts/fare-verification-smoke.mjs`: 912 directed pairs; 2,136 base and effective cells verified; 600 LRT-1 concession cells explicitly unverified; zero backend calls.
- `scripts/crowd-browser-repair-smoke.mjs`: real Chrome cross-tab lease and worker cases pass; not hosted Supabase transport.
- `npm run test:db`: 18 passed / 0 failed in actual isolated PostgreSQL 17.10. Twenty independent clients/backends race one sample and produce one delivery claim/observation. PostgreSQL stopped afterward.
- Whole-repository lint: latest simulator-repair run has zero errors and 204 warnings across 260 files. Warnings are not treated as a clean bill of health.
- Final simulator-repair production frontend matrix: **142/142 checks pass**, 35 screenshots, no uncaught page errors. The actual simulator buttons, pause/resume, switching, reset, live-trip isolation and completed replay now run alongside the four labels, both bars, NAV intermediate dwelling, raw transfer/final receipt, DR framing, map identity/interpolation, gestures, GeoJSON alignment, both themes and handheld/cookie gates. Explicit caught-error-boundary checks supplement `pageerror` collection. This replaces the earlier 122-check complete matrix, which had not exercised simulator playback.
- Focused final simulator replay: **16/16 checks pass**, two screenshots; the same simulator cases also pass in the complete final matrix. These are not 16 additional unique checks.
- Historical additional raw-GPS selected-phase replay: **46/46 checks pass**, 13 screenshots, no uncaught page errors. Browser geolocation callbacks feed actual sensor hooks, reducer, effective store and mounted cards; the same raw-GPS cases pass in the complete final matrix. All labels agree with effective speed/source/time, native zero immediately displays zero, two station fixes confirm dwelling, and the adjacent bar resets without erasing whole-trip progress. These overlapping setup/case counts must not be added to the full matrix as unique cases.

The PostgreSQL harness applies real repository migrations, grants, RLS and RPCs,
but supplies synthetic auth/JWT gateway context and a Realtime transport stub.
It does not certify GoTrue, hosted PostgREST, WebSocket delivery, Storage HTTP,
production grants or real Google cookies. Transactional migration rollback was
tested, not an executable production down migration.

The final independent recheck of R25-R30 and the narrow notification delivery
repair found no new issue in those fixtures after the missing-consent-key fix.
It was read-only, with no production calls. This is a bounded repair recheck, not
full-24, hosted or physical-device certification. Cross-tab startup lock races
and older clients that cannot participate in Web Locks remain unverified.

## Frontend Evidence And Performance

Headless Playwright is CLI-only; no Computer skill/CUA was used. Existing fonts,
card shapes, layout, CARTO dark/voyager tiles and animations remain. Leaflet keeps
ownership of pane/marker transforms; hover scale moves only the marker's inner
visual. Credits are linked/readable/transparent directly on the map plus a small
settings-menu reference; a hidden-menu-only attribution is not used.

Current screenshots/results are local ignored artifacts in
`.tmp-edge-debug/repair-20261009`. Historical design references are in
`.tmp-edge-debug/audit-20261008`. Screenshot inspection is not automatic proof of
an exact whole-product pixel baseline. Deterministic production replay, frame
timing, click-to-frame latency and transfer-byte results are recorded after the
final source freeze. Development timings are not used to certify production
60 FPS/30 FPS targets. Earlier post-cache moving-scene replay reached about
59 FPS normally (16.9 ms p95), but only about 22 FPS at 4x CPU throttling
(66.9 ms p95). The 30 FPS throttled target therefore remains unfulfilled;
icon caching alone is not evidence that all lower-end phones meet it.

### Final Production Profile

Latest capture: 2026-10-11 Asia/Manila on headless Chrome, Intel UHD / ANGLE D3D11 with
GPU compositing enabled. This is a desktop-controlled fixture, not a phone
benchmark. Six crowd trains and a fresh moving GPS journey were published each
second; real marker/card animations were retained. Backend predictions were
mocked and tile reads were fixture-controlled. The profiler spans UI actions as
well as its five-second frame window, so Playwright query functions in a CPU
profile are driver overhead, not proven application hotspots.

| Condition | Frame samples / window | Average FPS | p95 / maximum gap | Click-event to two frames |
| --- | --- | --- | --- | --- |
| Normal | 300 / 5.015 s | 59.8 | 16.8 / 33.3 ms; 0 gaps >50 ms | 17.9-39.3 ms |
| 4x CPU, 150 ms network latency | 119 / 5.010 s | 23.8 | 83.3 / 150.0 ms; 28 gaps >50 ms | 83.5-168.5 ms |

The normal fixture is approximately 60 FPS. The latest throttled average is
below 30 FPS and its p95 misses a 33.3 ms frame budget. The preceding simulator
repair run measured 59.2 FPS normally and 17.5 FPS at 4x; older post-cache runs
ranged from approximately 22 to 55 FPS under throttling.
Do not mark consistent lower-end performance achieved from the best run or an
average alone. Further phone/GPU/thermal and sustained-ride profiling is needed.
The final frame/action capture transferred 12,590 bytes in 16 fixture requests
normally and 21,450 bytes in 26 at 4x; those intervals include variable action
time and mocked responses and are not comparable hourly data/billing estimates.

The added raw-GPS images live under `.tmp-edge-debug/repair-20261009/raw-gps`.
The approach image shows the live counter and both bars; the confirmed-stop
capture includes a legitimate open congestion dialog, so it is not a clean
whole-card pixel-parity baseline. Correct mounted DOM values and inspected
screenshots do not certify every possible overlapping-overlay state.

### Mobile Data And Server Work

A read-only request to the currently published map prediction endpoint returned
33,074 decoded bytes / 3,328 gzip wire bytes. This proves current CDN compression,
not the payload of the repaired deployment. The repaired local production sample
had 18 map predictions (13,327 decoded bytes) and three station forecasts (2,700
bytes). Locally gzipping those bodies measured 1,845 and 767 bytes respectively;
those are estimates of compressed payload size, not measured repaired Vercel
traffic. The local Node route streamed uncompressed responses.

At an ideal one-second tick, map plus one station would be 7,200 HTTP requests per
foreground hour and roughly 9.4 MB/hour of those estimated compressed bodies.
A separately selected station can add a third request (up to 10,800/hour). Headers,
TLS/radio overhead, tiles, assets, Realtime, GPS submissions, cold starts and
variable fleet/forecast sizes are extra. Hidden/offline polling pauses; failures
back off; sequential responses mean slow requests lower effective cadence. This
is not "free" realtime or a universal MB/hour guarantee.

Warm per-instance configuration is coalesced/cached for five seconds; dispatch,
timeline, formatter and geometry reuse avoids per-request rebuilds. Serverless
cold-instance churn may still multiply database reads. Actual Vercel request,
compute/database costs must be observed on preview/production; don't extrapolate
the mocked frontend harness into a billing estimate.

Unvisited offline tiles/pages, long offline durations, expired authentication,
physical GPS/compass quality, real interchanges/stairs, background/screen-lock
behavior, thermal throttling and low-memory eviction require separate real-phone
and real-ride validation. No universal frame-rate guarantee is made.

## Design And Release Gates

`TRAINTRACKS_UI_REPAIR_HANDOFF.md` is the comprehensive Claude/Fable specification
for the new recovery decision, explicit compass permission, uncertain-GPS manual
transfer, history retry/discard/quarantine and update/retry controls. Those new
interfaces are not mounted and must not be reported as passed or silently added
by Codex. Dormant components (inventory #28 and #45-51) remain dormant.
Pending recovery intentionally cannot be silently replaced; without its new
decision control this is a confirmed user-facing blocked branch, not merely
untested polish. Retained receipts similarly need accessible retry/discard actions.

Production database migrations have been verified in isolation but are not
applied. App connectivity/public keys do not grant schema-management access.
Vercel's protected database/service keys cannot be exported; env pull produced
redacted placeholders, which are not credentials. A local `SUPABASE_DB_URL` or
user-applied reviewed SQL plus backup evidence is still required. Don't paste
database credentials into chat or commit them.

The initial preview lacked the protected CARTO key. After explicit user approval
on October 10, the existing sensitive `CARTO_BASEMAP_KEY` was extended to
`production` and `preview`, preserving its value, type and production target.
The same tested revision was rebuilt; both existing map themes now return PNG
tiles successfully. No Supabase service-role/database secrets were copied to
Preview. The stable Preview auth origin is now explicitly configured (see the
follow-up below); Supabase redirect acceptance and a real Google round trip
remain separate verification gates, not a broad wildcard deployment trust rule.

Recorded rollback reference: production deployment
`dpl_CUNpVsCk51C29dsfe7NbJY8kQG38`, revision `82c5d199`, ready before this repair.
Repair branch: `codex/reliability-repair-20261009`; default `main` remains unchanged.
GitHub reports the canonical repository as `karaagexc/TrainTracks`; the old
`YasuHirose/TrainTracks` remote redirects there. A fetch encountered corrupt
existing loose objects during automatic geometric repacking. Reachable-history
connectivity checking passes; no objects, refs or user files were deleted to
work around that warning. Publication uses per-command automatic maintenance
disabled. This is not a certification that every unreachable object is healthy.
The unrelated `public/exelec.svg` and `public/exelec-on-gray.svg` assets are left
untouched and excluded from this repair commit. Generated `public/sw.js` and
Workbox hash outputs remain local build artifacts, unstaged; Vercel regenerates
them from the committed source rather than publishing an incidental local precache.
Database backups, coordinated old-crowd-worker/RPC rollout, preview verification,
Fable integration and user-assisted Google login remain production gates. Never
promote an unverified preview, silently change maintenance or claim a production
rollback is safe merely because an application deployment can be restored.

### Published Draft And Preview

Draft review: [GitHub PR #1](https://github.com/karaagexc/TrainTracks/pull/1).
Tested application revision: `b4aab15e86ea111c1b860a2dadb228d154435e69`.
Initial [Vercel Preview](https://traintracks-44o4gvce6-aaron-martinezs-projects-ea1c41f7.vercel.app)
is **READY**, deployment `dpl_4teowhLteeJL2uTj5z45jFVZQSu3`, source CLI, with
the exact tested commit/branch metadata and no production aliases. It is
deployment-protected and is not a production-ready commuter release.

The deployment was uploaded from a Git archive, not the dirty checkout.
All 430 extracted archive files match their SHA-256 hashes. Vercel's uploaded
source manifest contains 429 matching SHA-1 hashes, zero mismatches; only
`.gitignore` is intentionally omitted by upload handling. Neither unrelated
user SVG is uploaded. This validates source identity, not every runtime feature.

Initial read-only preview HTTP results, before the CARTO target approval:

| Surface | Result / interpretation |
| --- | --- |
| `/`, `/login`, `/explorer`, `/api-console`, `/docs`, `/admin` | 200 HTML; not proof of authenticated admin access or every mounted success state |
| `/auth/reset-password`, `/auth/verified`, `/profile/setup` | 200 HTML; successful verification/profile writes and email delivery still pending |
| `/api/predictions` | 200; internal navigation endpoint remains available |
| `/api/admin/config` | 403 for anonymous request; no settings were changed |
| `/api/trips` | 401 for anonymous request; no history was written |
| `/api/map-tiles/dark/12/3425/1879.png` | 503; preview CARTO key is absent, so preview map rendering is not certified |
| `/api/crowd/presence` | 503 `crowd_storage_unavailable`; privileged preview backend configuration is unavailable |
| `/api/public/predictions` | 503; hosted public API availability/token lifecycle cannot be certified in this preview |
| `/auth/callback?code=invalid-smoke-code` | 400, origin not allowlisted; this deliberately invalid request never establishes a session and is not a Google round trip |

Requests used Vercel's supported protection-aware CLI. It generated a project
automation bypass token for the protected preview; no token value was printed
or committed. Those initial checks made no application writes, production
migration, maintenance change, CARTO secret-target expansion, main merge or
production promotion. The separately approved CARTO change is recorded below.
The public app keys remain configured locally, but no `SUPABASE_DB_URL` is
available for schema-management work. Do not copy production service-role
credentials to previews merely to turn a failing check green.

The HTTP checks and local browser fixtures have different boundaries: local
browser writes were blocked/mocked, while hosted smoke requests were GET-only.
Neither certifies real hosted OAuth cookies, Realtime transport, production
permissions, physical GPS or complete pixel parity. Resolve the gates above
before promoting this staged revision.

### Approved CARTO Preview Follow-Up

[CARTO-only protected Vercel Preview](https://traintracks-j78djeqyy-aaron-martinezs-projects-ea1c41f7.vercel.app)
is **READY**, deployment `dpl_HZJRpJdLSbXQX3HJVgEhmdwzcubS`, source CLI, for the
same tested application revision `b4aab15e86ea111c1b860a2dadb228d154435e69` and
repair branch. It has no production aliases. All 429 uploaded source-file SHA-1
hashes again match the verified archive, with zero mismatches and no unrelated
user SVGs. The follow-up changes environment targeting and release evidence,
not application code.

GET-only checks on this rebuilt preview:

| Surface | Result / interpretation |
| --- | --- |
| `/`, `/api/predictions` | 200; root page and internal predictions remain available |
| `/api/map-tiles/dark/12/3425/1879.png` | 200 `image/png`, 26,585 bytes; inspected existing dark CARTO tile |
| `/api/map-tiles/voyager/12/3425/1879.png` | 200 `image/png`, 41,382 bytes; inspected existing light CARTO tile |
| `/api/crowd/presence` | 503; privileged preview backend configuration remains unavailable |
| `/api/public/predictions` | 503; public API hosted availability remains uncertified |
| `/auth/callback?code=invalid-smoke-code` | 400; preview origin is not allowlisted, and no session was established |

These image checks resolve the preview key/tile availability failure; they do
not replace browser pan/zoom checks, certify every tile, or complete the Google
round trip. The key remains server-side; its value was not printed or committed.
Production alias lookup still resolves to `dpl_CUNpVsCk51C29dsfe7NbJY8kQG38` with
both existing production aliases. No production deployment, application data
write, migration, maintenance change or main merge occurred in this follow-up.

### Stable Preview Authentication Follow-Up

The user encountered the documented origin error after Google returned to the
generated CARTO-only preview hostname. The code correctly denied an unapproved
origin, but the published preview did not yet have a usable allowlisted sign-in
host. This was a release configuration failure, not evidence of missing admin
authority or a reason to grant client-editable roles.

Added non-secret `AUTH_ALLOWED_ORIGINS` to **Preview only**, with the single
origin `https://traintracks-preview-aaron-martinezs-projects-ea1c41f7.vercel.app`.
No existing auth allowlist was overwritten. Rebuilt the same tested application
revision without cache and assigned a new dedicated stable Preview alias:
[admin sign-in](https://traintracks-preview-aaron-martinezs-projects-ea1c41f7.vercel.app/admin).
The alias resolves to **READY** deployment
`dpl_9mjezkF2CqUgki83CgqadPfoFcfM`, immutable hostname
`traintracks-hvr9rg98w-aaron-martinezs-projects-ea1c41f7.vercel.app`, exact commit
`b4aab15e86ea111c1b860a2dadb228d154435e69` and repair branch. All 429 uploaded
source-file hashes match the tested archive, with zero mismatches. The new cloud
production/PWA build and TypeScript completed successfully; existing middleware,
Edge-import and dependency warnings remain recorded, not dismissed.

Read-only checks on the stable alias:

| Surface | Result / interpretation |
| --- | --- |
| `/auth/callback?code=invalid-smoke-code`, no verifier cookie | 307 to the same origin's `/login?error=auth_callback_failed&reason=pkce_verifier_missing`; `no-store`, no authorization code forwarded, no session exchange |
| `/admin`, `/api-console` | 200 HTML; not proof of authenticated admin success |
| `/api/auth/admin` | 401 anonymous; server authorization remains enforced |
| `/api/predictions` | 200; internal navigation remains available |
| `/api/map-tiles/dark/12/3425/1879.png` | 200; approved CARTO configuration retained |
| Same invalid callback on the generated immutable hostname | 400; unapproved origins are still rejected |

The expanded API/auth/config regression suite passes. New cases cover the
explicit Preview origin with and without a verifier, a mocked verified-session
return to same-origin `/admin`, `no-store` handling, and rejection of unknown
hosts, lookalike suffixes, wrong schemes and spoofed forwarding headers before
code exchange. Scoped test-script lint passes without errors or warnings.
These fixture successes do not certify hosted cookie propagation or real Google
authentication; a fresh user-assisted sign-in and reload on the stable alias
have been requested and are still awaiting confirmation. Old callback codes
must not be reused or forwarded between hosts.

Only the dedicated alias is approved for Preview sign-in. Generated deployment
hostnames remain denied; changing Preview deployments does not justify trusting
every `vercel.app` host. Production still resolves to
`dpl_CUNpVsCk51C29dsfe7NbJY8kQG38` with both original production aliases. No
production setting, migration, admin role, privileged secret, maintenance flag
or production deployment was changed. Crowd/public-backend availability and
the other production release gates are not resolved by this auth-origin change.

### Simulator Crash Follow-Up

The user's trip-simulator report exposed a missed mounted path, not an auth or
CARTO failure. On the previous Preview application source, clicking **LRT-2 EB**
reproduced React error 185 before the first movement interval. A render-created
timestamp and dependencies on estimator output repeatedly re-submitted the
same simulated position. React's error boundary caught it, leaving `pageerror`
empty; the previous test suite had neither clicked these controls nor asserted
this boundary on that path. Earlier green counts did not certify the simulator.

R35-R37 are now repaired without CSS, assets, API or database changes. Simulation
input time is captured by the store setter, independent of estimator metadata.
The engine owns an explicit trip ID, switches scenarios via begin rather than
amend, protects native/pending trips, stops on reset/override-off, and prevents
old interval work or a completed receipt timer from clearing a replacement.
Existing control appearance is unchanged; icon controls gain accessible names.
A narrow independent review found no remaining issue in the final replay and
interval corrections; runtime verification remains the parent's responsibility.

The final production/PWA build, standalone TypeScript, all eleven train suites,
142-check complete frontend replay and 16-check focused simulator replay pass.
The simulator replay uses actual mounted controls and explicitly rejects the
caught crash screen. Its completed-replay fixture uses the existing developer
end command; it is not an end-to-end physical ride. Simulation history remains
unsaved. No hosted application writes occurred in these tests.

Local failed evidence is retained: `simulator/pre-fix-results.json` and
`simulator/pre-fix-crash-390.png`, plus the prior scenario-switch and fixture
failures. The harness now applies the same advancing service-hour clock to all
isolated browser contexts, and acknowledges legitimate safety dialogs before
measuring settings interactions. It neither force-clicks through overlays nor
disables alerts, service rules, animations or design to make tests pass. The
latest performance result above retains the unmet throttled target.

Replacement Preview publication is recorded separately after deployed source
identity and read-only hosted checks. Production release gates remain open.

## Dependency Exposure

Current npm audit: **8 high, 2 moderate, 0 critical**. Affected dependency chains
include Tailwind 3/glob/watch/parser tooling, ESLint config/plugin tooling and
Next-PWA build dependencies. The advertised forced solutions include Tailwind 4,
an ESLint-config/Next 14 downgrade and a PWA major rollback; they are not compatible
repairs for this design-preserving plan. No `npm audit fix --force` was run.
Compatible serialization patch was applied; remaining chains need explicit
review. Build-tool exposure is not dismissed as harmless, and these counts are
not a full deployed exploitability analysis.

Primary sources: [Next security release](https://nextjs.org/blog/august-2026-security-release),
[LRTA fare policy](https://www.lrta.gov.ph/tickets-and-fares/),
[CARTO attribution](https://carto.com/attribution/),
[OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
