# TrainTracks: Every Card and Panel, Before the Audit

Date: 2026-10-08

**Historical snapshot:** the detailed inventory below records the pre-repair
implementation and its original defects. For current bar/state behavior, fixes,
test results and remaining gates, read
[Repair Verification](C:/Users/Exelec/Downloads/TrainTracks/TRAINTRACKS_REPAIR_VERIFICATION_2026-10-09.md).
The repair changes NAV rail progress to the cumulative current rail leg, makes
foreground predictions one-second HTTP-authoritative, retains station forecasts,
corrects fare/receipt semantics and protects recovery/history. Old failure
descriptions below are evidence, not claims that those defects remain unfixed.

This is a reference to the current implementation, not a promise that every behavior works in a real train. It explains what the code does, what feeds each display, which actions change a trip, and which components are not currently mounted. Train behavior is the focus; bus behavior is excluded. The completed read-only audit, coverage ledger, and remaining release checks are in [Train Audit](C:/Users/Exelec/Downloads/TrainTracks/TRAINTRACKS_TRAIN_AUDIT_2026-10-08.md); that report supersedes the initial testing-status section below.

## How the Trip and the Cards Connect

1. `FareSelector` chooses origin, ticket type, and destination.
2. `buildJourneyRoute` builds a sequence of rail and walking-transfer edges. It prioritizes fewer transfers, then shorter distance, then fewer hops, with a deterministic tie-break.
3. `useSmartLocation` collects and filters GPS measurements or supplies developer simulation measurements.
4. `useJourneyRuntime` feeds location samples and one-second ticks to the journey reducer.
5. `reduceJourneySnapshot` produces the authoritative journey phase, station cursor, display station, leg progress, whole-trip progress, direction, and estimator state.
6. `useTripStore.syncJourneySnapshot` synchronizes the compatibility fields used by older consumers. It also calculates running fare from the original entry station to the confirmed current station.
7. `useTripLogic` constructs the view used by `MainApp`, `TicketCard`, and `TripProgress`.
8. Train-presence data has a separate path: prediction, realtime crowdsourcing, and developer simulation feed `useTrainStore`. Upcoming and spectator cards consume that store; they do not determine the passenger's journey position.

The active station cursor and displayed station are distinct. When approaching, the displayed station can be the target while the confirmed cursor still belongs to the last station. The audit must check that all cards interpret this distinction consistently.

### Trip States and Labels

| Internal state/code | Meaning | Visible text |
| --- | --- | --- |
| `WAITING_AT_ORIGIN` / `AT_STATION` | Trip configured, still at origin | CURRENT STATION |
| `ONBOARD_DWELL` / `AT_STATION` | Confirmed stop at an intermediate station | CURRENT STATION |
| `ONBOARD_MOVING` / `LEAVING_STATION` | Leaving a station | NOW LEAVING |
| `ONBOARD_MOVING` / `BETWEEN_STATIONS` | Travelling between stations | IN TRANSIT |
| `ONBOARD_MOVING` / `APPROACHING_STATION` | Near the next station | NOW APPROACHING |
| `TRANSFER_WALK` / `TRANSFER_ACTIVE` | Walking between lines | TRANSFER TO the target line; NAV MODE in the lower card |
| `TRANSFER_WAIT` / `AT_STATION` | Arrived at the next line's platform | CURRENT STATION |
| `WAITING_FOR_GPS` | Insufficient usable position evidence | WAITING FOR GPS |
| `ARRIVED` | Completed journey | TicketCard uses its dedicated ARRIVED presentation |

`DWELLING` is a developer simulator state; it is not the passenger-facing label. The passenger-facing label is CURRENT STATION.

### What Real-Time Means in the Current Code

- Journey estimator: one-second reducer ticks while a trip is active, plus GPS samples as the shared location service publishes them.
- Passenger GPS: the browser supplies watched fixes during an active trip; the app filters noise rather than guaranteeing one accepted hardware measurement every second. Idle location requests use a different, lower-frequency policy.
- Predictions: the commuter client uses bounded HTTP polling, not the SSE endpoint. Normal polling is 15 seconds, 3G is 20 seconds, and saver/2G/slow-2G is 30 seconds. Network refresh pauses while hidden or offline.
- Prediction presentation has a separate one-second active tick. A one-second animated/recalculated position is not proof that a fresh API response or physical train report arrived every second.
- Crowd submission interval is separately adaptive: normally seven seconds, 3G ten seconds, and saver/2G fifteen seconds.
- Upcoming/spectator cards subscribe to shared train data; they do not individually own all those timers.
- GPS dead reckoning, missing mobile-data service, delayed crowd reports, and expired predictions are different conditions. The audit must check that their UI labels do not conflate them.

### The Two Progress Bars

| Bar | Source | What it measures |
| --- | --- | --- |
| Top station card | `journeySnapshot.legProgress` | Progress across the currently active rail or transfer edge |
| Bottom journey card | `journeySnapshot.totalProgress` | Distance-weighted progress across the complete route, including walking transfers |

Both displays clamp invalid values to 0 and valid percentages to 0-100. They are not duplicate indicators. A leg bar may restart for a new segment while whole-trip progress continues. Progress is not simply the number of stations passed.

## Cards in the Screenshots

### 1. TicketCard: Locating / GPS Problem State

Source: `src/components/TicketCard.tsx`, scanning branch; `src/hooks/useGatekeeper.ts`.

- Appears before an origin is selected when scanning has no usable station result.
- Spinner or warning icon distinguishes a location check from a blocking location problem.
- Title and explanatory message come from `LocationStatus`; they are not generated by a prediction API.
- Displays GPS accuracy when available.
- Retry Location calls the supplied location request function; disables itself while a request is in progress.
- Developer manual entry is shown only when the override/manual-entry conditions allow it. Normal commuter mode does not expose the same escape hatch.
- This card does not start a trip merely because a position arrives.
- Expected checks: permission denied, timeout, insecure context, unsupported geolocation, poor accuracy, stale fix, successful retry, and no overlapping location requests.

### 2. TicketCard: Nearest / Detected Station

- Appears with no selected origin and one unambiguous station result.
- Station badge and name come from the detected station; the line determines its colors.
- Distance is geographic distance from the location fix to the station, shown in kilometers with two decimals.
- DETECTED means the station is within the boarding threshold; NEAREST STATION means a station was found but is farther away.
- The current rail boarding threshold is 100 meters, separate from the broader nearby-station search radius.
- TAP IN calls `onRide(station)`. `MainApp` sets the origin and opens the fare selector.
- TOO FAR TO SCAN disables boarding unless a developer override is active.
- A move-closer message explains the disabled state.
- Common Station has a five-second cycling badge treatment; this is presentation, not a change to the route.
- The manual-entry link is developer-only in the mounted flow and is suppressed for stations in the component's terminus list.
- Expected checks: threshold boundaries, GPS jitter, wrong-line selection near interchanges, disabled-button behavior, MRT-3 badge contrast, and accurate station availability.

### 3. TicketCard: Transfer-Area Station Choices

- Appears before origin selection when more than one conflict candidate is returned.
- The heading identifies a transfer area and asks the user to choose the station they are boarding at.
- Each selectable row contains station identity, line badge, line name, and distance.
- Each candidate applies its own boarding-distance check.
- Selecting a row sets that station as origin and opens the fare selector.
- It does not auto-select between adjacent rail lines.
- Expected checks: Doroteo Jose/Recto, EDSA/Taft, both Cubao stations, sorting, stale-location handling, and preservation of the selected line through fare selection.

### 4. TicketCard: Current / Approaching / Leaving Station

This is the top green card in the first screenshot.

- Mounts after an origin is selected, unless the dedicated arrival branch applies.
- Status pill displays the reducer's mapped label: CURRENT STATION, NOW LEAVING, IN TRANSIT, NOW APPROACHING, or a transfer/GPS label.
- The large name uses `displayStation`, with origin as a fallback. It is not necessarily the confirmed current station during approach.
- The badge is generated from the displayed station's line and order. GL25 belongs to Dr. Santos.
- If station metadata lists transfers, line badges are shown beneath the name. These badges alone do not activate NAV MODE.
- The white progress bar represents the active leg, not the entire journey.
- Previous and Next Station come from the view-model's direction-dependent visual neighbors. They are geographic line neighbors, not proof that the passenger has visited those stations.
- Missing neighbors display Terminus. This depends on which station and direction the view model supplies.
- During a walking transfer, the footer changes from Previous/Next to FROM/TO and displays the two interchange stations and their lines.
- The gradient flashes for three seconds when the displayed station/status changes.
- `onTicketClick` is accepted as a prop, but the active-card JSX does not attach it to a click handler. The card itself is not currently a working fare-edit button.
- Expected checks: all four normal travel labels, zero-speed dwell, approach without premature cursor advancement, departure evidence, both directions on all live lines, leg reset, and transfer footer consistency.

### 5. UpcomingTrainsCard

This is the middle card saying Waiting for northbound trains in the screenshot.

Source: `src/components/UpcomingTrainsCard.tsx`.

- Uses `useTrainStore.trains`, not the passenger GPS speed.
- Uses `currentStation || origin` as its station context and the trip's direction as the filter.
- Returns nothing during TRANSIT or ARRIVED. It is a waiting-platform card, including transfer waiting, not an onboard tracker.
- Returns nothing when no station or direction is available.
- Header: station icon, station badge/name, and direction icon/label.
- Filters trains to the same line, same direction, and a station position from which they could approach this platform.
- Explicitly excludes entries marked `predictionScope === 'station'`.
- Prioritizes operator/crowd/simulation sources before predicted sources, then station distance, then confidence. The first result is therefore not necessarily the shortest-time arrival.
- Shows at most three trains.
- Each train row displays status, station badge/name, stops away, estimated arrival range, source, freshness, confidence, signal quality, direction, and terminus where available.
- First result gets the Next marker.
- ETA sums stored segment times; missing segment times use 120 seconds. Intermediate stops add 30-second dwell allowances.
- ETA uncertainty widens according to stops away, with a minimum 30-second window. This is a model, not operator-confirmed arrival time.
- Fresh, aging, and stale data use different visual states; stale rows remain visible with reduced opacity.
- Empty state means no matching entries survived the filters. It does not prove there are no physical trains running.
- Clicking a train selects its ID and enables spectator mode in the train store. `MainApp` still prioritizes the companion cards while an origin exists, so the click does not guarantee that the spectator detail card becomes visible during a trip.
- No independent API poller is inside this card. Updates depend on the shared train runtime and store.
- Expected checks: source deduplication, filter boundaries, empty/loading/error distinction, confidence labels, expired data, actual click outcome, and missed station-scope predictions.

### 6. TripProgress: Journey Summary

This is the lower card with destination, speed, fare, Stops 8, and Trip Progress 0%.

Source: `src/components/TripProgress.tsx`.

- Appears whenever `MainApp` has an origin, not only while physically moving.
- Destination falls back to the destination in the trip store if the prop is missing.
- Header normally switches between Next Station and Destination distance/time every five seconds.
- If `distanceToNext` is falsy, the effective header mode is forced to Destination. A zero-distance value is treated the same as a missing distance in this branch.
- On an intermediate confirmed station change, the component enters a 30-second arrival phase and cycles door-side and direction information. Departure/between-stations status ends that phase early.
- Door-side text comes from station metadata; it is not a sensed door opening.
- Speedometer reads `useLocationStore.sample.speedKph`, rounds to an integer, and clamps 0-120 km/h. Null/invalid speed becomes 0. This small subcomponent does not directly consume `journeySnapshot.estimatedSpeedKph`.
- Destination/Entry Point content rotates every ten seconds. Header statistics and the Destination/Entry rotation have separate timers.
- Station name, line, and station badge follow whichever endpoint is being shown.
- Distance-to-destination uses remaining route distance supplied by the journey engine.
- ETA divides distance by the active line's configured average commercial speed and adds 0.5 minutes per remaining stop. It is an estimate; it does not use the live speedometer reading.
- Transfer Point text comes from a hardcoded origin-line/destination-line pair label, not directly from the selected route's transfer edge.
- A multi-line journey displays a fare breakdown for the full origin-to-destination route, split by line.
- The separate Total Fare number is `runningFare`, calculated to the confirmed current station. At origin, PHP 0 is expected from this implementation. It is not the full-trip fare quote despite its label.
- Ticket chip displays the chosen payment type, such as SJT or SVC.
- Stops shows `stopsRemaining`. For a transfer journey, a split view shows stops before the next transfer and stops afterwards with line badges.
- The stop count is derived from the route/display-station index, so approach-display changes need explicit consistency tests.
- Whole-trip progress is distance-weighted and shown both as a percentage and a colored bar.
- Progress includes a text accessibility label and tooltip, but is not currently implemented as a semantic `role="progressbar"` widget.
- The normal card does not itself start, end, or reroute the trip.
- `isMuted` and its setter are read in this module, but the current rendered card does not expose a mute button.
- Expected checks: every header cycle, accurate door/direction branch, zero versus unknown data, whole-trip monotonicity, final 100%, transfer progress, dynamic destination changes, and fare-label consistency.

### 7. TripProgress: NAV MODE

This is a different branch of the same TripProgress component, not a second navigation engine.

- Activates when the view exposes an active transfer edge with both transfer stations. It is not activated merely by opening Line Explorer or clicking a transfer badge.
- Header changes to NAV MODE / Guidance Active.
- Displays route description and instruction from the transfer edge, with fallback Follow Signs / Transfer to text.
- Direction symbol is selected from STRAIGHT, LEFT, RIGHT, UP, or DOWN.
- Compass runtime reads current location and device orientation, calculates bearing to the transfer target, and writes the rotation into a CSS custom property.
- When position, heading, or target is unavailable, the rotation defaults to zero. A static arrow is not proof that orientation permission was granted.
- Walking distance prefers the store's remaining walking distance, then transfer metadata, then a 150-meter fallback.
- Walk Time assumes 72 meters per minute and rounds upward. It is not a measured pedestrian ETA.
- Target-line panel states which line the user is transferring to.
- Whole-trip progress remains visible in the shared footer.
- The header speedometer remains mounted and uses the shared location sample, including while walking.
- Completion is determined by the journey reducer's target proximity/accuracy evidence, not by this component's timer or the arrow.
- Expected checks: both directions at each real interchange, decreasing remaining distance, correct target coordinates/instructions, orientation denied/unsupported, stationary GPS jitter, target completion, and handoff to platform waiting without reopening NAV MODE.

### 8. TicketCard: Arrived Summary

- Replaces the active TicketCard when the compatibility trip status is ARRIVED and an origin exists.
- Destination is preferred as the arrival station; display station and origin are fallback values.
- Shows ARRIVED, arrival station badge/name, door-side metadata, exit reminder, Distance, Time, and final fare.
- Distance currently uses straight-line origin-to-destination distance, unlike route-distance metrics in TripProgress.
- Time currently estimates that straight-line distance at 30 km/h plus two minutes. It is not the trip's measured elapsed time.
- Final fare is recalculated for the complete origin/destination pair and selected ticket type; SJT is the train fallback.
- END TRIP fades the card, then resets the store after 400 milliseconds.
- Automatic close counts down from 60 seconds, fades, then resets after a further 500 milliseconds.
- The history-saving subscription in `MainApp` is separate and attempts to capture arrival before reset. Clicking END TRIP is not the sole history-save trigger.
- Expected checks: true destination arrival only, accurate displayed statistics, history saved once, offline save/retry, countdown cleanup, and no delayed reset affecting a subsequent trip.

### 9. LineExplorer

This is the second screenshot.

Source: `src/components/LineExplorer.tsx`.

- Mounted once an origin exists in train mode.
- Shows a horizontal diagram of one selected line, not just the planned route.
- Starts from LRT-1, then follows confirmed current station/origin line.
- Line tabs select LRT-1, LRT-2, or MRT-3; MRT-7 is offered in sandbox mode.
- Direction buttons change this diagram's point of view. They do not call the trip store's direction setter or reverse the passenger's journey.
- LRT-2 uses east/west labels and arrows; the other train lines use north/south.
- Trip direction changes can update the diagram's direction automatically.
- The station list order follows the selected point of view.
- Each station displays its name and generated station-code badge.
- The current confirmed station gets the glow/highlight. A selected destination is not automatically the same thing as the glowing station.
- Small triangle decorations represent the station's door-side metadata, not a moving train's direction.
- Transfer labels are station metadata with display-name substitutions such as MRT-3 Taft and LRT-1 D. Jose.
- Clicking a station opens StationInfoModal; it does not change origin/destination.
- Current-station or line changes request a smooth recenter after 150 milliseconds.
- Click/touch interaction starts a ten-second inactivity timer that attempts to return to the current station/line.
- `handleScroll` exists in the file but is not attached to the rendered scroller. The claimed inactivity behavior therefore needs a real interaction test, particularly wheel/drag-only browsing and line-tab changes.
- Expected checks: diagram order, east/west behavior, auto-follow versus browsing, timer cleanup, no station-name overlaps on narrow phones, modal accessibility, and line availability.

## Other Commuter Cards and Panels

### 10. SpectatorInfoCard: Nothing Selected

- Shown in spectator mode only while no trip origin is selected.
- Prompts the user to select a train or station on the map.
- Active train count is the length of the merged train store, not a verified physical-fleet census.
- No route, fare, or passenger progress is calculated by this state.

### 11. SpectatorInfoCard: Selected Train

- Looks up the selected train ID in the current train store.
- Displays line, abbreviated train ID, source, freshness, status, station badge/name, direction, signal quality, confidence, and speed.
- Stale entries show an awaiting-newer-signal message.
- Follow toggles `followedTrainId`; camera following is handled elsewhere by the map.
- Close clears the selection; it does not terminate an active journey.
- Selection changes animate for approximately 400 milliseconds.
- Predictions, crowdsourced trains, operator entries, and simulations are explicitly labeled differently. Predicted positions should not be read as confirmed GPS positions.

### 12. SpectatorInfoCard: Selected Station

- Looks up a selected station ID from the available network.
- Displays name, line, badge, and optionally a congestion chip.
- Congestion comes from the congestion model/configuration, current time, and relevant train data; it is not an authoritative live passenger counter.
- Upcoming trains combine both directions when they can approach this station.
- Prioritizes observed/simulated sources ahead of predictions, excludes station-scope prediction entries, and displays at most four train rows.
- Shows confirmed/expected counts and reported signal count. Those totals are calculated from the qualifying list, not solely the four displayed rows.
- Each row shows location/status, stops away, ETA range, source, signal quality, direction, and terminus when available.
- Clicking a row selects that train; Station Info opens its informational modal; close clears station selection.
- Congestion time refresh uses a minute clock; train information follows train-store updates.

### 13. StationInfoModal

- Opened from Line Explorer or selected-station spectator details.
- Uses local `STATION_INFO` records for description, history, name origin, and photographs.
- Header displays badge, station name, line, underground indication, and transfer metadata.
- Photograph slideshow advances every 4.5 seconds when multiple usable images exist.
- Previous/Next and dot buttons select images; failed images are skipped and their dots disabled.
- If all images fail, a visual fallback is shown instead of a broken image.
- Station changes reset image selection/error state.
- Close and the Radix dialog's close interaction call the supplied close handler.
- Missing station information makes the modal return nothing; it does not fetch missing descriptive data from the prediction API.

### 14. RecentTripsCard

- Mounted when there is no selected origin and the user is authenticated.
- Lists the recent trip records supplied by `useTripHistory`; this component itself does not fetch them.
- Each row shows origin/destination, one or two line accents, relative completion time, and fare rounded for display.
- View All and every row open the full history. Rows do not automatically repeat that journey.
- Empty state invites the user to complete a ride.
- Relative time is calculated during rendering, not by a separate continuously ticking timer.
- A local `visible` state exists, but the current UI provides no dismiss control that changes it.

### 15. TripHistoryModal and Its Trip Cards

- Opening calls the supplied `onLoad` fetch function.
- Header shows recorded trip count; summary tiles show money spent, total distance, and trip count from supplied statistics.
- Records are grouped by completion date using the browser's locale/timezone.
- Each collapsed row identifies the route, lines, time, and fare.
- Clicking a trip toggles its expanded details. Only one expanded ID is kept.
- Expanded details include the recorded journey information, ticket, direction, distance/duration/fare fields where rendered.
- Loading and empty states are explicit.
- Close/backdrop starts a fade and calls onClose after 250 milliseconds.
- It does not rewrite trip records just because the user opens or expands them.

### 16. WrongDirectionAlert

- Uses `useWrongDirection`; visible only when wrong-way evidence is HIGH confidence.
- Explains destination mismatch and a ticket-specific fare-risk message.
- I'm going the right way sets the ignore-wrong-direction flag and dismisses.
- Fix my trip updates origin through the trip-safe handler, then dismisses.
- I changed my destination updates origin when possible and opens fare selection; existing destination remains a fallback until selection changes it.
- Dismiss/backdrop hides the alert without choosing a new route.
- Expected checks: false positives at platforms/transfers, opposite-direction departure, ticket-risk accuracy, ignore reset, and preservation of destination/status when repairing origin.

### 17. CongestionAlert

- Uses `useCongestionAlert` to determine visibility, station, and congestion model result.
- Shows severity, affected station, model reason/description, rush/event labels where present, and station-specific or generic advice.
- Close calls the hook's dismiss handler.
- It does not reroute, change fare, or submit a crowd report merely by appearing.
- Styling includes configurations for all congestion tiers, but actual visibility is determined by the hook.

### 18. StallAlert: Possible Disruption

- Uses `useStallDetector`, not simply a zero speedometer number.
- Shows detected stationary duration and asks whether the stop is traffic or an emergency.
- Just Slow Traffic calls the traffic-confirmation handler.
- Emergency Stop calls the emergency-confirmation handler.
- UI says it auto-classifies after 15 seconds; the timeout behavior lives in the detector hook and still needs verification.
- This is a write-capable feature: testing its buttons against production could create reports. Such tests must be isolated or mocked.

### 19. StallAlert: Confirmed Delay

- Alternative branch of the same StallAlert after `CONFIRMED_DELAY`.
- Shows service-disruption message and stall duration.
- Understood calls the dismiss-delay handler.
- This is distinct from an independently aggregated line-wide incident.
- The displayed typical-resumption text is fixed copy, not an operator forecast.

### 20. ServiceDisruptionBanner / Incident Cards

- Reads `useIncidentListener.activeIncidents`.
- Displays one banner per undismissed incident, with line, PSA, severity, report count, confirmation age, and nearest station if present.
- Emergency and traffic incidents have distinct styles.
- Trains moving again? invokes the incident resolve-vote handler and disables the local button after the click.
- Vote recorded is optimistic local UI; the card does not await a server success result before setting that state.
- Close dismisses only that incident locally. It does not resolve the server incident.
- Dismissed IDs are cleaned as incidents leave the active list.
- The actual aggregation/verification thresholds belong to the crowd incident domain and backend, not this presentation component's comments.

### 21. ReconnectionBanner

- Shows when the store requests GPS reconnection and the status helper permits it; suppressed in developer mode.
- Waits 300 milliseconds before displaying and increments a local timer once per second.
- Shows Trying to reconnect and Signal lost ... ago.
- Counter starts when the component mounts, rather than reading the timestamp of the actual last GPS fix.
- The Wi-Fi-off icon is a visual symbol; this component does not diagnose mobile-data connectivity or reconnect a websocket.
- Recovery/removal of the flag unmounts the banner and clears its timers.

### 22. GPSFallbackHandler

- In the current `MainApp`, this blocking panel is mounted inside the developer-mode section.
- Shows a blocking location problem, with a 2.5-second wait for an initial checking state and no extra wait for a known error.
- Displays diagnostic title/message and permission state.
- Allow / Retry Location calls the shared location requester and obeys canRequest/request-in-progress flags.
- Use DevOpts Simulation chooses a fallback sandbox station and enables simulated-location override.
- It is not itself the route-constrained dead-reckoning estimator. Its name can suggest more than the component actually does.

### 23. GPS Fallback Indicator

- Small inline indicator in MainApp, separate from ReconnectionBanner and GPSFallbackHandler.
- Appears when journey fallback is active and simulation override is off.
- Presentation only: it has no retry control and does not advance a train.
- The forthcoming audit must verify that journey-estimated positions and speeds also reach the map/speed display, not merely that this badge appears.

### 24. Before-Boarding Safety Card

- `JourneySafetyReminders` owns its scheduling; `SafetyRules` renders the card.
- Requires origin, destination, and an active trip at the original station, with no confirmed departure, AT_STATION, WAITING_AT_ORIGIN, and a non-UNCERTAIN estimator.
- Eligible state must remain long enough for the two-second display timer.
- Rule tiles explain yellow-line safety, letting passengers exit, respecting the door buzzer, and protecting valuables.
- I Understand animates closure and marks PRE_BOARD dismissed for that trip key.
- Reset/arrival or a changed trip key clears the reminder bookkeeping.

### 25. In-Transit Safety Card

- Rendered by `TransitRules`, scheduled by the same reminder owner.
- Requires TRANSIT, confirmed departure, at least 120 meters projected on the active edge, at least 45 seconds since trip start, ONBOARD_MOVING, BETWEEN_STATIONS or APPROACHING_STATION, leg progress 8-82%, and a non-UNCERTAIN estimator.
- The eligible condition must remain long enough for a five-second display timer.
- Rule tiles cover handrails, priority seating, doors, and footing/gaps.
- I Understand dismisses this reminder for the trip key.
- It is not meant to open on every station change or while transferring.

### 26. Crowd Signal Consent Card

- Opens from the crowd control in MainApp.
- Explains anonymous train-presence sharing and displays informational feature tiles.
- Enable stores consent as granted; Not Now stores denied; close dismisses without enabling.
- Consent itself is not a train-location transmission. The separate crowdsource runtime decides whether and when to publish.
- The visible promise of no name/login/trip history being sent needs payload inspection during the audit; UI copy is not verification.
- Production button tests must not accidentally broadcast fabricated locations.

### 27. FareSelector and Destination Cards

- Main trip-configuration panel with ORIGIN, TYPE, and DESTINATION steps.
- Opens at TYPE if origin exists; otherwise at ORIGIN.
- Manual origin selection changes the store origin, then moves to fare type.
- Train fare choices are Single Journey, regular Stored Value, and Concessionary via the stored-value accordion.
- Choosing a fare with no destination moves to destination selection. With an existing destination, it updates the ticket and immediately starts/restarts the trip.
- Destination list excludes the origin and uses the available operational network.
- Selecting destination sets it, infers direction from the route's initial same-line movement, starts the trip, and closes the panel.
- Each destination row shows name and line-color dot; its right-hand badge alternates line ID and geographic distance every three seconds.
- That row's distance is straight-line endpoint distance, not remaining rail distance.
- SJT destination rows show a fare quote when positive. Stored-value rows do not expose the same fare text branch.
- Routes crossing more than two distinct lines get the multi-leg/high-fare warning treatment.
- Destination-step back returns to fare type. Dismissing selection does not inherently mean rollback of every store field already set.
- Expected checks: cancellation at every step, changing ticket/destination during an active trip, inaccessible/unavailable stations, zero-fare versus unsupported-fare handling, and route/direction agreement.

### 28. Notification Settings Card (Not Currently Mounted)

- This component exists but repository search found no current JSX use. Its behavior below describes the component, not a working entry point in MainApp.
- Options set notification preference to all, destination, or none.
- Selecting a non-none option requests browser notification permission when supported and not already decided.
- Denied permission is represented by an informational warning; selecting the preference does not override the browser's denial.
- Permission status is refreshed when the dialog opens.
- This configures notifications; delivery is performed by separate hooks/service-worker/browser APIs.

### 29. Profile Drawer and Stat Tiles

- Displays profile image or generated initials, display name, username, and email.
- Member Since derives from profile creation date.
- Active status is presentation in this drawer, not a server health or recently-online measurement.
- Edit Profile closes the drawer and opens profile setup in edit mode.
- Password opens set/change-password UI depending on detected password state.
- Email change is hidden for Google-provider users.
- Sign Out opens confirmation, rather than logging out on the first click.

### 30. Profile Setup / Edit Card

- Inputs include avatar, username, display name, and optional account-password setup where applicable.
- Avatar selection and submission are separate handlers.
- Username availability/validation, loading, and error/success states belong to the form flow.
- Submit can upload an avatar and update profile/auth data. These are write operations and must not be exercised against production casually.
- Edit mode allows closing; onboarding behavior differs from edit mode.
- Expected checks: invalid/duplicate usernames, image size/type, upload failure, partial update failure, refresh of displayed profile, and OAuth-only accounts.

### 31. Authentication / Password / Email Cards

- AuthModal has sign-in, sign-up, password-reset, Google OAuth, visibility toggle, pending, error, and email-sent presentations.
- Email sign-in/sign-up invoke Supabase auth; Google uses the OAuth redirect helper. None of these cards grants administrator privileges itself.
- LoginSuccessModal is a post-login presentation whose completion closes the auth flow; it is not independent evidence of a valid admin session.
- ChangePasswordModal supports change, initial set, and recovery/reset modes, with confirmation, validation, request progress, error, and success states.
- ChangeEmailModal has new-email and verification-code steps, then a success presentation.
- LogoutModal has confirmation and completion/transition behavior and invokes the supplied sign-out callback.
- These forms are write-capable. Full success-path tests need isolated accounts/mocks; read-only production auth checks do not prove the complete OAuth round trip.

### 32. Welcome / Information Feature Cards

- WelcomeScreen contains welcome and technical-information presentations and four feature tiles: Live GPS, Smart Alerts, Offline Ready, and Transfer helper.
- Those tiles are descriptive, not individual launch controls.
- Technical copy describes geofencing/dead reckoning and claims GPS/accelerometer fusion. A claim in this panel must be checked against actual sensor/runtime wiring; it should not be treated as implemented merely because it is written here.
- This is onboarding/info UI, not a route-planning or live-data engine.
- Tell me more opens the details presentation; Skip Intro or Let's Go dismisses; Back returns from details to welcome.
- The technical panel also claims reliable locked-screen stop alerts. That requires real platform/background testing; the service worker's existence alone does not prove it.

### 33. Blocking / Status Screens

- ClosedScreen replaces the commuter screen when MainApp considers service closed, unless a bypass applies.
- MaintenanceScreen represents remote maintenance state.
- HolyWeekScreen represents a configured holiday closure window; the current MainApp dates are a hardcoded 2026 window.
- RegionGuard displays an out-of-service-area screen based on geographic bounds.
- SecurityGuard can display handheld-device, cookie, or restricted-tools blocking screens.
- ErrorBoundary renders a fallback after a caught React rendering error. PanicLogger captures diagnostics separately.
- These are not journey cards, but they can prevent any of the journey cards from being reached. Their conditions, accessibility, false positives, retry behavior, and active-trip interruption must be included in the subsequent audit.

## Developer and API Console Cards

These are included for completeness. No production setting, token, account, incident, or crowd data was changed while creating this reference.

### 34. CommandCenter / Simulation Control Panels

- Mounted in developer mode; displays simulator status, speed multiplier, reset/hide, and developer logs.
- LRT-2 EB and Transfer QA start predefined rail scenarios.
- Turnaround/start control creates a default scenario when needed or changes the simulated route while preserving appropriate context.
- Origin/destination selectors use sandbox stations.
- Play/Pause controls the simulator; Skip advances to the next simulated stop; multiplier controls simulated travel speed.
- Crowd Live / Sim Fleet chooses observed versus mocked fleet behavior; fleet time-factor controls its separate simulation clock.
- MRT-7 mode controls sandbox availability, not public-service deployment.
- Maintenance toggle calls a remote update function. It is a real write-capable control, not a harmless local preview.
- Test-notification controls exercise browser notification delivery.
- Reset clears the trip after confirmation.
- Simulation QA is useful, but it cannot substitute for real-device GPS and physical tunnel behavior.

### 35. DevMonitorPanel: GPS Card

- Displays location/speed/heading, accuracy/timestamps, nearest stations, and simulation/runtime indicators from shared location/trip hooks.
- It observes the runtime; it is not the source of passenger GPS measurements.
- The audit must compare it with the passenger speed display and the authoritative journey estimator.

### 36. DevMonitorPanel: Zones Card

- Calculates station/dwell/leaving/approach zone sizes from segment-distance heuristics.
- Displays zone label and distances to stations.
- These diagnostic calculations are not automatically the same thresholds used by the rewritten journey reducer. A convincing monitor label does not establish that the production reducer made the same decision.

### 37. DevMonitorPanel: Trip Card

- Shows trip origin/destination, confirmed stations, direction/status, ticket/fare, and view-model progress information.
- Provides a diagnostic comparison surface for route and UI consistency.
- Does not itself confirm physical boarding or charge a fare.

### 38. DevMonitorPanel: Event Log Card

- Records station, status, direction, GPS, zone, and system changes locally.
- Keeps the newest 100 entries and supports category filtering.
- Time strings are based on browser-local clock formatting.
- Log entries are observations by this panel, not durable server audit records.

### 39. API Console: Summary and Per-Line Cards

- Summary shows prediction counts, number of active lines, day type, and global service state.
- Each rail-line card shows configured line, prediction count, service state, direction counts, loading, and error where available.
- Fetches map-scope predictions for LRT-1/LRT-2/MRT-3 on a ten-second timer, with manual refresh.
- Active Trains is based on returned predictions, not verified physical fleet size.
- Rush-hour/time-window card uses `/api/rush-hour`, refreshed every 30 seconds, and shows window, daypart, multiplier, and rush/closed/off-peak labeling.

### 40. API Console: Crowd / Stall / Incident Cards

- Crowd Presence and Stall Reports show realtime channel status and session signal counters.
- Recent Stall Reports feed lists received report events, severity, station, and timing fields.
- Active incident presentation updates from confirmed/updated/resolved broadcasts and shows incident information.
- These session counters are not the same as an all-time database count.
- Merely viewing does not intentionally submit crowd reports, but action tests elsewhere must isolate report/vote mutations.

### 41. API Console: Token Cards and Confirmation Dialogs

- Loads token records through authenticated `/api/admin/api-tokens` GET.
- Displays token metadata and supports copying the newly generated plaintext token.
- Generate POST requests a named token with `predictions:read` scope.
- Revoke DELETE targets the selected token ID after confirmation.
- Errors are surfaced in token-action state.
- Token tests involving create/revoke cannot be treated as read-only production probes.

### 42. API Console: Playground Card

- Chooses line, direction, station, map/station scope, and limit.
- Builds a query to the internal `/api/predictions` endpoint.
- Run fetches and formats the JSON result; network exceptions are rendered as errors.
- Copy/curl functions produce a command for the currently configured internal URL.
- This playground is not automatically a test of public bearer-token authorization.

### 43. API Console: CLI Polling Card

- Start/Stop toggles repeated map-prediction requests for the three live rail lines.
- Poll interval is adjustable; default is ten seconds.
- Shows timestamp, line result counts, and service state, retaining the last 100 entries.
- Failure entries use error state and negative placeholder counts.
- Auto-scrolls the log. It is browser polling styled as a CLI, not a terminal process running on the server.

### 44. API Console: Configuration and Docs Cards

- Configuration fields support metadata, value validation, staged edits, discard, commit confirmation, and saved messages.
- In the current `ApiConsole` implementation, commit writes `traintracks_cfg_*` values to localStorage; API Enabled writes `traintracks_api_enabled` locally.
- That UI alone does not prove global backend configuration or public API availability changes. Server consumption of those settings needs separate verification.
- Docs tab displays API reference material; code/copy examples are informational, not a guarantee that endpoints match the examples.
- `ApiConfirmModal` is the shared confirmation presentation for selected potentially destructive actions.

## Components Present but Not Mounted in the Current Flow

These must not be mistaken for additional working production features. Repository searches found no current JSX use for the following components in the normal route flow.

### 45. NearbyStationsCard

- Alternative nearest-station card with line badge, station name, meter distance, and Start Trip.
- Computes nearest station from `useSmartLocation` and allows its button within 250 meters.
- MainApp imports it but does not render it. The actual home scanning UI uses TicketCard instead and has a different boarding threshold.
- Its safe-looking initializing state is not evidence of production scanning behavior.

### 46. TrackingCard

- Alternative STOPPED/MOVING station card with Previous/Next text.
- Chooses current station while stopped and next station while moving.
- Contains fixed badge labels and a fixed arriving-in-about-two-minutes message.
- Not the active four-state TicketCard implementation.

### 47. InfoCard

- Two stat tiles displaying Stops Left and Fare supplied as props.
- Has no GPS, fare engine, route reducer, fetcher, or actions of its own.
- Not the mounted TripProgress summary.

### 48. StationTimeline

- Alternative vertical station list with past/current/future styling and transfer badges.
- Uses supplied station list and current station ID; no route computation or GPS advancement inside it.
- Not the mounted horizontal LineExplorer.

### 49. GeofenceScanner

- Alternative location/nearest/conflict scanning flow with its own FareSelector opening.
- Defines a 250-meter search/entry constant and uses shared proximity/location utilities.
- Has retry and origin-selection handlers.
- Not the current MainApp scanning card. Threshold differences must not be assumed to affect the deployed TicketCard.

### 50. DevControls

- Legacy Div Simulator card that chooses a station and calls `setOrigin`.
- Despite its Teleport wording, it does not itself emit a geolocation measurement.
- Not the mounted CommandCenter.

### 51. DevDashboard

- Legacy Debug Location panel selecting a station, enabling GPS override, setting simulated coordinates, and setting current station.
- Shows current station, selected simulated target, and fare.
- Not the current mounted developer simulator. Its existence alone does not prove public developer access is enabled.

## What the Screenshots Currently Mean

For Dr. Santos to Gil Puyat:

- CURRENT STATION: the view is currently representing Dr. Santos as a station stop.
- GL25: Dr. Santos' configured line/order badge.
- Empty top bar: no progress across the next rail leg yet.
- Previous: Terminus: no preceding visual neighbor in the selected direction at this endpoint.
- Next Station: Ninoy Aquino: the next visual station toward the selected direction.
- Waiting for northbound trains: the platform card found no qualifying train entries after filtering. This is not a physical-service guarantee.
- Destination Gil Puyat / GL17: the selected endpoint.
- 8.6 km / about 23 min: remaining-distance and model ETA presentation, not a measured trip duration.
- 0 km/h: the shared location sample is zero or lacks a valid speed. This number alone does not prove confirmed dwell.
- PHP 0 / SJT: accumulated fare at the original station; the label Total Fare is currently ambiguous.
- Stops 8: remaining route-index count for that display state.
- Trip Progress 0%: whole-trip distance-weighted progress at the origin.
- Line Explorer glow on Dr. Santos: diagram highlighting the confirmed current station.
- NB/SB: diagram point-of-view controls, not trip-direction controls.

## Testing Status and Next Audit Boundary

Completed before the broader audit was paused:

- Existing journey smoke suite: passed.
- Existing train-presence smoke suite: passed.
- Existing incident smoke suite: passed.
- Existing prediction smoke suite: passed.
- Existing station-image smoke suite: passed.
- Existing logic-rebuild smoke suite: passed.
- TypeScript check: passed.
- ESLint: zero errors, 181 warnings across 229 reported files. This is not a clean-bill-of-health result.
- Initial read-only production checks: home, prediction GET, and a map-tile GET responded HTTP 200. These checks only established those responses, not full payload correctness, authorization, journey rendering, or API coverage.
- No bus-specific smoke suite was requested or run in this pass.
- Initial production-build verification failed while creating a `.next/server/app/login.segments/login` directory with Windows `EPERM`. The authorized retry outside the restricted sandbox completed successfully, including TypeScript, prerendering all 13 static pages, and build traces. The deprecated middleware convention warning remains; it was not adjusted.
- Focused attribution check against the local production build at a 390 x 844 mobile viewport: one Leaflet map container, zero attribution controls. Browser write requests were blocked. The page also showed the expected location-permission-blocked state and onboarding overlay; this was not a journey/NAV MODE visual test.
- Logic-rebuild smoke suite rerun after the attribution edit: passed. Compiled CSS was also inspected to confirm the transparent vendor override survives Tailwind's output.

Not yet established: complete route-pair coverage, real-browser journey replay, all progress transitions, NAV MODE across every interchange, API endpoint/authorization matrix, OAuth success paths, offline recovery, real hardware sensor accuracy, low-end-phone frame rate, battery/data usage, or physical train/tunnel behavior.

The upcoming API audit should be read-only against production. Test successful crowd submission, incident voting, history creation, account changes, token generation/revocation, and maintenance changes with mocks or an isolated backend. It must not change production configuration/data or modify API source as part of testing.

### API Coverage to Establish Next

| Endpoint family | Required verification | Production mutation boundary |
| --- | --- | --- |
| `/api/predictions` | Map/station scope, each rail line/direction, limits, invalid input, Manila time/day type, payload schema, cache/freshness, error states | Read-only GET |
| `/api/predictions/stream` | SSE format, heartbeat/update cadence, abort/disconnect, listener cleanup | Bounded read-only connection |
| `/api/public/predictions` and `/stream` | Missing/invalid/valid/revoked tokens, scope checks, CORS, errors, rate limits, parity with internal engine | Use isolated tokens for success/revoke tests |
| `/api/rush-hour` and `/api/public/rush-hour` | Timezone/daypart/window boundaries, Friday/event cases, auth where required | Read-only requests |
| `/api/public/congestion` | Per-station/line model shape, severity, invalid input, confidence/source metadata | Read-only requests |
| `/api/crowd/presence` and public counterpart | Consent/payload validation, station/direction/status mapping, GPS bounds/freshness, duplicate identity, broadcast count | Successful submissions only with mocks or isolated backend |
| `/api/stall-report` and public counterpart | GPS/stall validation, identity/cooldown, unique reports, persistence/broadcast and retry | Successful reports only in isolation |
| `/api/public/stall-config` | Public response shape and agreement with runtime constraints | Read-only GET |
| `/api/incidents` and public counterpart | Active incident list, line filtering, timing, aggregation visibility | Read-only retrieval |
| `/api/incidents/resolve` and public counterpart | Vote validation, idempotency, threshold and persistence | Successful votes only in isolation |
| `/api/trips` | Authentication, user ownership, validation, pagination/read behavior, idempotent save/retry | No production trip creation/deletion |
| `/api/auth/admin` | Anonymous 401, authenticated non-admin 403, admin 200, session refresh, no sensitive caching | Isolated identity fixtures for privileged cases |
| `/api/admin/config` | Admin authorization, schema, persisted configuration agreement and errors | No production setting changes |
| `/api/admin/api-tokens` and token-ID route | Admin-only listing, one-time plaintext generation, scope enforcement, revoke, error/empty states | No production token creation/revocation |
| `/api/map-tiles/...` | Allowed style/path validation, no client key exposure, successful raster responses, cache headers, missing-key/upstream failure | Small read-only tile sample; no stress test |

An HTTP 200 check alone does not satisfy this matrix. Live service success, malformed-input handling, missing authorization, simulated happy paths, and real backend authorization need separate results.

The requested map-attribution removal is a separate UI exception, not permission to adjust the journey/API implementation. It does not change the basemap provider, CARTO style, tile proxy, routing, or GPS engine.

The local attribution edit has not been committed, pushed, or deployed as part of this report-first pause. No trip/GPS/prediction/auth/API implementation adjustments were made.

Provider caveat: CARTO currently requires visible, linked OpenStreetMap/CARTO credits on maps and states that noncompliant keys may be suspended/revoked. Removing the control is not a licensing exemption. Sources: [CARTO attribution](https://carto.com/attribution/), [CARTO basemap terms](https://www.carto.com/legal/basemap-terms/), [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).
