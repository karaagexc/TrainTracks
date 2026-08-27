# TrainTracks UI/UX Implementation Brief for Fable

## Your Role

You are redesigning and implementing the presentation and interaction layer of TrainTracks, a map-first commuter companion for Metro Manila rail and EDSA Carousel trips. Work in the existing Next.js/React codebase. You own component composition, client-side interaction ergonomics, CSS, responsive behavior, animation, accessibility, and visual QA.

Do not create a second trip engine, GPS estimator, fare calculator, authentication flow, crowd broadcaster, offline queue, or API authorization path. Those systems already exist and are covered by smoke tests. Consume their states and actions. Do not move business rules into components.

Do not add Astryx or any Astryx packages. Use the existing Cabin font, Tailwind/CSS setup, Lucide icons, Leaflet map, and existing bitmap assets.

## Product Reality

Design for a commuter who:

- uses a lower-end Android phone on mobile data;
- may lose signal in stations, tunnels, or dense corridors;
- glances at the screen one-handed in a moving, crowded vehicle;
- needs honest uncertainty, not fake precision;
- may resume after the browser is backgrounded or killed;
- needs the map, current station, next action, fare, and disruption state faster than decorative content.

The first screen is the working map experience, not a landing page. Keep `MapExplorer` full-bleed and unframed. Chrome and sheets may overlay it, but never put the map inside a decorative card.

## Non-Negotiable Domain Boundaries

Treat these as authoritative and do not rewrite their logic:

- `src/domain/journey/*`: route graph, journey reducer, GPS projection, dwell confirmation, dead reckoning, recovery, and status text.
- `src/hooks/useJourneyRuntime.ts`: the only automatic GPS-to-journey writer.
- `src/hooks/useTripLogic.ts`: a read-only view adapter. It is not a second trip engine.
- `src/store/useTripStore.ts`: atomic compatibility state synchronized from the journey snapshot.
- `src/hooks/useSmartLocation.ts`, `src/domain/location/gpsFilter.ts`, and `src/domain/location/speed.ts`: GPS lifecycle, filtering, native zero-speed handling, and speed smoothing.
- `src/domain/offline/*`, `src/hooks/useOfflineRuntime.ts`, and `src/hooks/useTripPersistence.ts`: checkpoints, preferences, IndexedDB/localStorage fallback, and durable outbox.
- `src/hooks/useGpsCrowdsource.ts` and `src/domain/crowd/*`: consent, cross-tab lease, idempotent samples, durable writes, and realtime broadcast.
- `src/data/fareMatrix.ts`, `src/data/fareMatrixBus.ts`, `src/data/farePolicy.ts`, and `src/utils/fareNew.ts`: all fare calculations and provenance.
- `src/domain/predictions/*` and API routes: schedule-model provenance, token scopes, CORS/origin checks, and API contracts.
- `src/domain/auth/*`, `src/lib/auth/*`, middleware, and auth callback: OAuth code exchange and safe return paths.

If a UI need appears to require domain changes, document the missing selector/action and request the smallest adapter. Do not infer journey progress independently from raw coordinates in a component.

## Core Journey States

Render the existing journey snapshot faithfully. Important states include:

- `IDLE`: no active trip.
- `WAITING_AT_ORIGIN`: rider has selected a trip but departure is not yet proven.
- `ONBOARD_MOVING`: confirmed movement along the active route edge.
- `STATION_DWELL`: a multi-sample, time-confirmed stop at a route station.
- `TRANSFER_WALK` and `TRANSFER_WAIT`: transfer instructions and target line/station.
- `ARRIVED`: destination reached.

Estimator modes are user-facing trust signals:

- `LIVE`: recent accepted GPS fixes drive progress.
- `COASTING`: short GPS gap; last motion is being carried briefly.
- `DEAD_RECKONING`: route-constrained estimate during a longer signal loss.
- `STATION_DWELL`: estimate is capped at the next station and waits for GPS confirmation. It must never visually skip the station.
- `RECOVERING`: GPS has returned and is reconciling with the route. Recovery can advance at most one passed station per reconciliation.
- `UNCERTAIN`: accuracy or signal age is too poor for a trustworthy position.

Show confidence and uncertainty in plain commuter language. Never present dead reckoning as live GPS. Never animate a train beyond the route cursor or imply that an unconfirmed station was passed.

Recommended concise labels:

- Live location
- Signal weak, estimating
- Estimating along route
- Waiting for GPS at station
- GPS restored, checking position
- Location uncertain

Use stable space for these labels so changing modes does not resize the trip panel.

## Speedometer and Station Behavior

The speed value comes from the existing GPS speed pipeline. Native speeds at or below the stop threshold become zero immediately; two low-motion samples near a station also confirm zero. Do not add CSS/JS interpolation that makes the displayed number lag behind state. A number transition may animate briefly, but it must snap promptly to `0 km/h` when the state does.

`NOW APPROACHING` must come from journey status, not from a component timer. At a confirmed dwell, display the station-dwell state and stop the approaching treatment.

## Train Marker Rules

This is a strict visual requirement:

- Preserve the current direction-badge circle placement. The user explicitly wants the circle where it is now.
- Change only the arrow glyph orientation when direction changes; do not move the circle to “fix” an arrow.
- LRT-2 eastbound arrows point right and westbound arrows point left. They must never render as up/down arrows while docked.
- When multiple docked directions are represented, use the existing deterministic badge anchors and avoid overlapping badges. Do not invent random offsets.
- Keep the train artwork legible and centered on the track. Do not obscure it with a larger badge.
- MRT-7 is the **Maroon Line** (`#800000`). It is not the Red Line.
- Red Line is reserved for NSCR, which is not implemented. Do not add NSCR in this pass.

Use `src/utils/trainMarker.ts` and current train-presence status/direction fields. Preserve marker dimensions so icon refreshes cannot shift Leaflet anchors.

## Map and GeoJSON

- Keep the primary map full-bleed.
- Preserve Leaflet ownership of pane transforms. Never add global transforms to `.leaflet-map-pane`, `.leaflet-zoom-animated`, tile panes, overlay panes, SVG roots, or canvas panes.
- Rail/EDSA geometry must remain aligned during pan and pinch zoom.
- Keep route and station hit targets usable without visually inflating every station.
- Do not reproject or mutate GeoJSON in a component. Existing data helpers convert `[longitude, latitude]` to Leaflet coordinates.
- Preserve `preferCanvas`, idle tile updates, bounded tile buffer, and data-aware retina tile behavior.
- Locally vendored Leaflet markers live under `public/leaflet/`; do not restore `unpkg` marker requests.
- Maintain safe-area spacing around browser chrome and bottom sheets on Android/iOS.

## Map-First Layout

Prioritize this visual order during an active trip:

1. Current/estimated position and route.
2. Current state and next station/action.
3. Speed and GPS confidence.
4. Remaining stops/distance and fare.
5. Disruptions, crowd state, and secondary controls.

Use a compact overlay or bottom sheet that leaves useful map context visible. Avoid nested cards, oversized hero type, marketing copy, and decorative page sections. Cards are for individual tools or repeated records, not for wrapping the entire screen.

Keep settings/profile/spectator controls reachable but visually secondary. Use familiar Lucide icons and tooltips for icon-only desktop controls; provide accessible labels on mobile.

## Bus Mode

Bus mode is currently a developer sandbox but must be visually complete.

Fix the known contrast failure where line-colored/photographic card backgrounds make these unreadable:

- “Nearest station” label;
- stop code and stop name;
- distance text;
- “Too far to scan” disabled state;
- helper copy and “Already on the train?” action.

Do not solve contrast by dimming the whole page with an opaque gray veil. Use semantic surface/text tokens, a controlled scrim where needed, and WCAG-readable disabled styling.

Nearby curbside stops can overlap. Consume `getStationProximity` results:

- `nearest`: current best stop;
- `conflicts`: plausible alternatives within the GPS overlap zone;
- `confidence`: high/medium/low;
- `ambiguityReason: 'gps_overlap'`.

At a stop, select that stop directly. In an overlap zone such as City of Dreams/Ayala Malls Manila Bay, present a short, explicit stop chooser rather than silently oscillating. Preserve the previous choice while distances remain within hysteresis.

## Fare Presentation

Never hard-code fare values in JSX. Use `getFareQuote` for breakdown/provenance and `getPrecisionFare` only where a number is sufficient.

Current fare rules as of **2026-08-10**:

- LRT-1 uses its fare matrix effective 2025-04-02.
- LRT-2 and MRT-3 have a 50% all-passenger fare-relief policy effective 2026-03-23, active until further notice.
- LRT-2/MRT-3 single-journey discounted fares round to whole pesos.
- Stored-value discounted fares round to the nearest `PHP 0.50`.
- The blanket relief does not stack with the white-card concession discount.
- Standard NCR air-conditioned bus fare is `PHP 18` for the first 5 km plus `PHP 2.98` for each succeeding kilometer.
- Standard statutory concession is 20% off.
- Service Contracting is opt-in per participating marked vehicle, not route-wide: 20% off regular fare and 40% off concession fare.

Show a subtle policy/source affordance where fare is selected or finalized:

- “50% fare relief applied” with “until further notice” and last-verified date.
- Base fare versus effective fare where useful.
- Standard bus fare versus “Participating Service Contracting vehicle” as an explicit rider selection/confirmation. Never assume participation.
- For transfer trips, show per-line segments and a total.

Use `PHP` in machine-oriented/API text and `₱` in polished UI where the current font renders it correctly.

## Crowdsource and Disruptions

Crowd presence is consent-based and anonymous. The UI must distinguish:

- consent unknown;
- consent denied;
- active locally;
- broadcasting;
- stored for retry/offline;
- temporarily rate-limited or low-accuracy;
- not eligible because the rider is not confirmed onboard.

Do not display every network retry as a new train. Signal counts are unique-reporter evidence, not raw broadcast counts. Do not expose device IDs, pseudonyms, sample IDs, access tokens, or precise historical traces.

Disruptions have pending, confirmed, and resolved states. A report may be stored even if realtime fan-out is temporarily unavailable. Reflect durable state and sync state separately.

## Offline and Resume UX

Use the existing connectivity/outbox/checkpoint state. Required experiences:

- Small persistent offline indicator that does not block navigation.
- Pending-write count and “will sync when connected” treatment.
- Resume automatically for a checkpoint no older than 20 minutes.
- Ask Resume/Discard for a checkpoint between 20 minutes and 6 hours.
- Discard expired/corrupt/future-dated checkpoints without restoring them.
- Explain dead reckoning separately from offline sync; they are related but not the same.

Do not clear an active trip merely because a fetch failed. Do not promise synced history until the outbox confirms it.

## Data Mode and Performance

Expose the existing `auto`, `standard`, and `saver` modes as a segmented control or clear menu option.

- `auto`: honors browser Save-Data and network effective type.
- `standard`: normal prediction/map behavior.
- `saver`: lower tile resolution/buffer and slower bounded polling/report cadence.

Performance target is the highest stable refresh rate the phone supports, without deleting the visual identity:

- Animate compositor-friendly `transform` and `opacity`.
- Avoid layout animation of large map overlays.
- Avoid continuously animating large blur/backdrop-filter regions over the moving map.
- Pause nonessential animation and realtime subscriptions while the document is hidden.
- Keep fixed dimensions for buttons, badges, marker shells, counters, and status rows.
- Memoize repeated map markers and lists; do not subscribe a whole screen to fast-changing store objects when a scalar selector is enough.
- Do not add a second animation loop around Leaflet marker interpolation.
- Use responsive assets and never download a large image for a tiny thumbnail.
- Retain meaningful motion by default. Respect `prefers-reduced-motion` for accessibility; do not globally remove animations as a performance shortcut.

## Theme and Visual System

Preserve `system`, `light`, and `dark` theme behavior. Build a small semantic token layer for:

- app/map chrome surface;
- elevated/overlay surface;
- primary and muted text;
- border/divider;
- focus ring;
- success/warning/error/info;
- disabled text/surface;
- map scrim.

Transit colors are domain accents, not page backgrounds:

- LRT-1 green;
- LRT-2 purple;
- MRT-3 yellow;
- MRT-7 maroon;
- EDSA bus teal/green as currently defined.

Avoid a one-note purple, beige, dark-slate, or orange palette. Avoid gradient orbs/bokeh decoration. Keep cards at 8px radius or less unless preserving an existing component that Fable intentionally migrates in a later step.

## Accessibility

- Allow browser zoom; do not disable user scaling.
- Minimum touch target: 44 by 44 CSS pixels for primary controls.
- Maintain visible keyboard focus and logical focus order.
- Dialogs trap focus, close with Escape when safe, and restore focus to the opener.
- Do not rely on color alone for line, confidence, disruption, or sync states.
- Use `aria-live` sparingly for arrival/disruption changes, not every GPS sample.
- Provide text alternatives for marker and station images.
- Avoid all-caps paragraphs and excessively tracked compact text.
- Ensure long station names and Filipino/English labels wrap without overlapping controls.

## Auth and Admin

Preserve OAuth behavior:

- Google/email flows use `prepareOAuthRedirect(returnTo)`.
- `/admin` returns to `/admin` after callback.
- Middleware recovers Supabase fallback redirects arriving as `/?code=...`.
- Never exchange OAuth codes in a client component.

The API Console must use server-backed token endpoints:

- `GET /api/admin/api-tokens`
- `POST /api/admin/api-tokens`
- `PATCH /api/admin/api-tokens/:id`
- `DELETE /api/admin/api-tokens/:id`

Never generate API tokens in the browser or store full tokens in localStorage. Raw tokens are shown exactly once after creation. Design controls for:

- name;
- scopes: `predictions:read`, `incidents:read`, `incidents:write`, `crowd:write`;
- allowed browser origins;
- expiry;
- active/revoked state;
- last-used time;
- one-time copy confirmation.

The API docs must continue to state that predictions are a schedule/headway model, not a live operator feed. Credentials are accepted only through `Authorization: Bearer` or `X-API-Key`, never query parameters.

## Screens and Routes to Cover

- `/`: map, companion/spectator switch, idle/waiting/transit/arrived, trip recovery, offline, settings, profile.
- `/login`: password, Google, forgot password, safe `next` return.
- `/auth/callback`, `/auth/verified`, `/auth/reset-password`.
- `/profile/setup`.
- `/explorer`: line/station exploration including sandbox MRT-7 Maroon Line.
- `/api-console`: stats, secure tokens, playground, config, CLI/log presentation.
- `/docs`: accurate endpoint/auth/provenance content.
- `/admin`: signed-out, checking, denied, granted, expired-session states.
- Bus sandbox: nearest/far/ambiguous stop, north/south direction constraints, trip states.

## Expected Component States

For every data surface, design:

- initial loading;
- empty;
- populated;
- stale/aging;
- offline with cached data;
- recoverable error with retry;
- permission denied;
- low GPS accuracy;
- maintenance/service closed;
- keyboard focus and pressed/disabled states.

Do not use visible tutorial prose to explain basic controls. Use familiar icons, concise labels, progressive disclosure, and state-specific messaging.

## Delivery Rules

1. Preserve domain behavior and endpoint contracts.
2. Keep visual changes in components/styles and small UI adapters.
3. Do not introduce Astryx.
4. Do not remove features, route modes, animations, crowd states, fare detail, or offline states to make the UI simpler.
5. Do not reintroduce external Leaflet marker URLs, query-string API tokens, localStorage API secrets, or independent trip progress timers.
6. Run TypeScript, ESLint, and the full `test:logic` suite after changes.
7. Build production and visually inspect mobile and desktop screenshots at all listed routes/states.
8. Specifically compare LRT-2 docked arrow orientation, badge-circle placement, BUS card contrast, COD/Ayala Aseana overlap, long station names, light/dark themes, and map alignment during zoom.

## Acceptance Criteria

- A commuter can understand the next action within one glance.
- Signal loss changes trust language without jumping stations.
- Returning GPS reconciles smoothly and honestly.
- Stopping at a station produces a prompt zero speed and dwell state.
- LRT-2 docked arrows are east/west while badge circles retain their established placement.
- MRT-7 is always Maroon and sandbox-only.
- BUS cards remain readable against every route color/background.
- Nearby bus-stop ambiguity is explicit and stable.
- Fares match the centralized current policy and show temporary-relief provenance.
- Offline writes and trip recovery are visible but not obstructive.
- API tokens are real, scoped, origin-aware, revocable, and one-time reveal.
- The map remains aligned, full-bleed, responsive, and smooth on lower-end phones.
- No component creates a competing source of truth for trip, GPS, fare, crowd, auth, or offline state.
