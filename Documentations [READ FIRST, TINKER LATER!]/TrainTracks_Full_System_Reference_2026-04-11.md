# TrainTracks Full System Reference

Date: 2026-04-11  
Author: Codex

## Purpose Of This Document

This file is a full system reference for the current TrainTracks workspace. It explains:

- what the app is trying to do
- what features are implemented
- how the runtime is structured
- what each first-party file in the workspace is for

Scope rules for this document:

- Included: first-party app code, project docs, scripts, SQL, diagnostics, raw data, local assets, and support files in the workspace.
- Excluded from file-by-file breakdown: vendor and generated dependency/build trees such as `.git/`, `.next/`, `.vercel/`, `node_modules/`, and `train-tracks/node_modules/`.
- Secret values are intentionally not reproduced from `.env.local`.

## What The App Is

TrainTracks is a location-driven rail commute assistant focused on Metro Manila rail lines. At runtime it tries to:

- detect the rider's current station and direction automatically
- guide the rider from origin to destination across single-line and transfer routes
- show status, stops, fares, timeline, door side, transfer walking, and ETA-style hints
- overlay live train telemetry from TrainSight
- offer a spectator/explorer mode for browsing the network, lines, stations, and trains
- persist user identity and trip history through Supabase
- support development and debugging through simulation, teleportation, and monitoring tools

The core product idea is "hands-off commute guidance": the app wants to infer where the user is, where they are heading, and what should be shown next, with as little manual interaction as possible once a trip starts.

## Implemented Feature Set

### Core commute flow

- Origin and destination selection across supported lines
- Ticket type selection and fare breakdown
- Static route generation across same-line and transfer journeys
- Automatic station progression during a ride
- Total trip progress, stops remaining, and distance-to-next/destination readouts
- Transfer guidance via NAV MODE with walking distance and progress
- Wrong-direction detection and recovery prompts
- GPS loss fallback through dead reckoning / simulated continuation
- Arrival-phase UI, direction badges, and door-side hints

### Live train and spectator features

- Polling TrainSight for live train positions
- Proxy routes for TrainSight train and GPS feeds
- Telemetry normalization into unified status strings
- Train map layer and live markers
- Spectator mode with train selection and station selection
- Upcoming trains card filtered by station and direction
- Congestion/rush-hour heuristics and alerts
- Nearby stations discovery from current location

### Account, persistence, and personalization

- Supabase-based auth/session flow
- Alpha PIN gate
- Login and password reset UI
- Profile setup and editing flows
- Trip history persistence and review
- Notification preference selection
- Browser notification support for station/destination alerts
- Wake lock support and background-audio keepalive support

### Guardrails and policy screens

- Region/device guard behavior
- GPS-required fallback blocker
- Maintenance mode support via Supabase config
- Operating-hours closed screen support
- Holy Week shutdown screen support
- Onboarding / rules screens
- Aggressive anti-inspection / anti-desktop guard logic

### Developer and maintenance tooling

- Command center and simulation controls
- Teleport/debug panels
- Dev monitor/event log
- Mock train engine
- Autosave scripts
- Fare-matrix generation helper
- OCR and data-extraction helper scripts for TrainSight docs and MRT-7 coordinates

## Runtime Architecture

### High-level runtime flow

1. `src/app/page.tsx` boots the main client experience.
2. `src/components/MainApp.tsx` acts as the main orchestrator for guard screens, trip setup, trip tracking, spectator mode, dev tools, and major overlays.
3. `src/hooks/useSmartLocation.ts` produces the main location stream by combining raw GPS, simulation, route alignment, dead reckoning, and override state.
4. `src/hooks/useTripLogic.ts` is the high-level trip orchestrator. It composes station progress, transfer logic, wrong-direction logic, and display state.
5. `src/store/useTripStore.ts` is the main ride/session store. It holds selected trip data, trip status, computed route, dev flags, and many UI/runtime flags.
6. `src/hooks/useTrainPolling.ts` fetches live trains. `src/services/trainSightApi.ts` and the API route proxies handle remote TrainSight access. `src/utils/telemetryMapper.ts` converts raw statuses into app-readable statuses. `src/store/useTrainStore.ts` stores the live fleet and spectator selections.
7. Presentation components such as `TripProgress`, `TrackingCard`, `TicketCard`, `UpcomingTrainsCard`, `SpectatorInfoCard`, `MapExplorer`, and `LineExplorer` render the state.
8. Supabase is used for auth, profile state, app config, and trip history.

### Main state domains

- `useTripStore`: rider trip/session state
- `useTrainStore`: live train fleet and spectator state
- static datasets under `src/data/`: network topology, geofences, fares, line geometry, congestion metadata, station info

### Main external systems

- TrainSight: live train and GPS telemetry
- Supabase: auth, profiles, trip history, maintenance/app config
- Browser APIs: Geolocation, Notifications, Wake Lock, Device Orientation, Storage, Service Worker / PWA

## Important Current-State Notes

- MRT-7 exists in the data/UI behind a dev flag, but it is not modeled everywhere as a fully complete production line.
- The repo contains both the real app and a nested `train-tracks/` dependency snapshot with its own manifest files.
- Several documents in the docs folder describe the intended architecture; the current runtime has drifted from that clean model in places. This document describes the app as it exists now.

## File Catalog

### Root files

- `.env.local` - Local environment file for secrets and deployment-specific config such as Supabase and TrainSight values; contents are intentionally not echoed here.
- `.gitignore` - Git ignore rules for the repo.
- `api_docs.txt` - Raw copied/OCR-ed TrainSight API notes used as a local reference.
- `Beep_Card_white_stacked.webp` - Visual asset for the Beep card style used by the UI/design work.
- `eng.traineddata` - Tesseract English OCR model file used by `ocr_docs.mjs`.
- `eslint.config.mjs` - ESLint configuration for the Next.js/TypeScript codebase.
- `fetch_mrt7_coords.mjs` - Utility script used to fetch or assemble MRT-7 coordinate data.
- `fetch_wiki.mjs` - Utility script used to fetch Wikipedia-derived station or line reference material.
- `line7.txt` - Working notes/reference text for MRT-7.
- `lrt1-beep-svc-fares.csv` - Raw LRT-1 stored-value fare source data.
- `lrt1-geopoint.xhr` - Raw LRT-1 geographic/coordinate source capture.
- `lrt1-sjt-fares.csv` - Raw LRT-1 single-journey fare source data.
- `lrt2-beep-svc-fares.csv` - Raw LRT-2 stored-value fare source data.
- `lrt2-geopoint.xhr` - Raw LRT-2 geographic/coordinate source capture.
- `lrt2-sjt-fares.csv` - Raw LRT-2 single-journey fare source data.
- `markdown-preview (2).pdf` - Exported preview copy of markdown documentation.
- `middleware.ts` - Root Next.js middleware entry; wires request handling into Supabase session middleware.
- `mrt3-beep-svc-fares.csv` - Raw MRT-3 stored-value fare source data.
- `mrt3-geopoint.xhr` - Raw MRT-3 geographic/coordinate source capture.
- `mrt3-sjt-fares.csv` - Raw MRT-3 single-journey fare source data.
- `mrt7_coords.json` - Working JSON output for MRT-7 coordinates.
- `next.config.mjs` - Next.js config, PWA integration, and build behavior flags.
- `next-env.d.ts` - Next.js generated TypeScript ambient declarations.
- `ocr_docs.mjs` - OCR helper script used to process TrainSight API reference screenshots into text.
- `package-lock.json` - Locked npm dependency graph for the active app.
- `package.json` - Package manifest for the active app, including scripts and dependencies.
- `patch_geojson.mjs` - Data cleanup/patching script for line geometry or geojson-like source files.
- `postcss.config.js` - PostCSS configuration for TailwindCSS processing.
- `Quick Commuter Crowd Guide.txt` - Text reference used to inform congestion/rush-hour heuristics.
- `README.md` - Top-level readme; currently closer to stock Next.js boilerplate than true project documentation.
- `START_AUTOSAVE.bat` - Windows batch launcher for the git autosave workflow.
- `tailwind.config.ts` - Tailwind config, theme tokens, and design utility setup.
- `test-api.mjs` - Diagnostic script for TrainSight API access against one endpoint pattern.
- `test-api-2.mjs` - Alternate TrainSight API diagnostic script for another endpoint pattern.
- `test-api-full.mjs` - Broader TrainSight API probe script covering multiple request shapes.
- `test-api-results.txt` - Saved output/results from API testing.
- `test-crowd.ts` - Diagnostic script for crowdsource/live-train logic behavior.
- `test-math.ts` - Diagnostic script for fare/route/math experiments.
- `test-route.ts` - Diagnostic script for route generation behavior.
- `test-supabase-config.mjs` - Diagnostic script for Supabase connectivity/config validation.
- `tsc_output.txt` - Captured TypeScript compiler error output.
- `tsconfig.json` - TypeScript project configuration.
- `tsconfig.tsbuildinfo` - Generated TypeScript incremental build cache.
- `wiki_results.txt` - Saved output from the wiki-fetch workflow.

### Docs folder

- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Known_Issues.md` - Current known-issues register for important runtime defects and risks.
- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Known_Issues.pdf` - PDF export of the known-issues document.
- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Project_Documentation.md` - Existing project documentation describing architecture, flows, and file inventory.
- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Project_Documentation.pdf` - PDF export of the project documentation.
- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Triple_Audit_Report_2026-04-10.md` - Prior audit report describing structural, tooling, and security issues.
- `Documentations [READ FIRST, TINKER LATER!]/TrainTracks_Full_System_Reference_2026-04-11.md` - This full system-reference document.

### API doc OCR working files

- `api_pages/all.txt` - Combined OCR text output from the TrainSight API page images.
- `api_pages/page_1.png` - OCR source image for API doc page 1.
- `api_pages/page_1.txt` - OCR text output for API doc page 1.
- `api_pages/page_2.png` - OCR source image for API doc page 2.
- `api_pages/page_2.txt` - OCR text output for API doc page 2.
- `api_pages/page_3.png` - OCR source image for API doc page 3.
- `api_pages/page_3.txt` - OCR text output for API doc page 3.
- `api_pages/page_4.png` - OCR source image for API doc page 4.
- `api_pages/page_4.txt` - OCR text output for API doc page 4.
- `api_pages/page_5.png` - OCR source image for API doc page 5.
- `api_pages/page_5.txt` - OCR text output for API doc page 5.
- `api_pages/page_6.png` - OCR source image for API doc page 6.
- `api_pages/page_6.txt` - OCR text output for API doc page 6.
- `api_pages/page_7.png` - OCR source image for API doc page 7.
- `api_pages/page_7.txt` - OCR text output for API doc page 7.

### Legacy / local marker assets

- `GPS Marker/lrt1.png` - Legacy local marker image for LRT-1.
- `GPS Marker/lrt2.png` - Legacy local marker image for LRT-2.
- `GPS Marker/mrt3.png` - Legacy local marker image for MRT-3.

### Public assets

- `public/file.svg` - Default/placeholder public SVG asset from the starter scaffold.
- `public/globe.svg` - Default/placeholder public SVG asset from the starter scaffold.
- `public/gps-markers/lrt1.png` - Public GPS marker asset for LRT-1.
- `public/gps-markers/lrt1.svg` - Public vector GPS marker asset for LRT-1.
- `public/gps-markers/lrt2.png` - Public GPS marker asset for LRT-2.
- `public/gps-markers/lrt2.svg` - Public vector GPS marker asset for LRT-2.
- `public/gps-markers/mrt3.png` - Public GPS marker asset for MRT-3.
- `public/gps-markers/mrt3.svg` - Public vector GPS marker asset for MRT-3.
- `public/manifest.json` - PWA manifest defining app identity and install metadata.
- `public/next.svg` - Default/placeholder public SVG asset from the starter scaffold.
- `public/sw.js` - Generated service worker script used for PWA behavior.
- `public/vercel.svg` - Default/placeholder public SVG asset from the starter scaffold.
- `public/window.svg` - Default/placeholder public SVG asset from the starter scaffold.
- `public/workbox-f1770938.js` - Generated Workbox runtime bundle used by the service worker.

### Scripts

- `scripts/add_concession_fares.js` - Utility that augments fare data with concession-fare entries.
- `scripts/git-autosave.ps1` - PowerShell autosave script for automated local git commits/pushes.

### Supabase SQL

- `supabase/add_destination_line.sql` - Migration that adds destination-line support to stored trip records.
- `supabase/app_config_migration.sql` - Migration that creates or updates app-level config such as `maintenance_mode`.
- `supabase/fix_admin_policy.sql` - Policy patch for admin-access behavior.
- `supabase/fix_app_config_rls.sql` - Policy patch for `app_config` row-level security/update behavior.
- `supabase/fix_email_and_admin.sql` - Patch file for email/profile/admin-related schema or policy fixes.
- `supabase/migration.sql` - Main base migration for core app tables/policies.
- `supabase/reset_profiles_rls.sql` - Policy reset script for the `profiles` table.
- `supabase/trip_history_migration.sql` - Migration for trip-history persistence support.

### Nested duplicate app snapshot

- `train-tracks/package.json` - Nested secondary package manifest representing a separate dependency snapshot/version line from the main app.
- `train-tracks/package-lock.json` - Lockfile for the nested secondary package manifest.

## `src/app/`

- `src/app/admin/page.tsx` - Admin route that performs strict user verification and renders admin controls for privileged users.
- `src/app/api/trainsight/gps/route.ts` - Next.js API route that proxies TrainSight GPS data access.
- `src/app/api/trainsight/trains/route.ts` - Next.js API route that proxies TrainSight live train data access.
- `src/app/auth/callback/route.ts` - Supabase auth callback handler that finalizes login/session redirects.
- `src/app/auth/reset-password/page.tsx` - Password reset page for logged-in reset flows.
- `src/app/auth/verified/page.tsx` - Post-verification success page after auth confirmation.
- `src/app/error.tsx` - Route-segment error UI for App Router errors.
- `src/app/explorer/page.tsx` - Full-screen explorer route for line browsing, maps, and station exploration.
- `src/app/favicon.ico` - Browser favicon for the app.
- `src/app/fonts/Cabin-BoldItalic-TTF.woff2` - Cabin bold italic font asset used by the app.
- `src/app/fonts/Cabin-Bold-TTF.woff2` - Cabin bold font asset used by the app.
- `src/app/fonts/Cabin-Italic-TTF.woff2` - Cabin italic font asset used by the app.
- `src/app/fonts/Cabin-MediumItalic-TTF.woff2` - Cabin medium italic font asset used by the app.
- `src/app/fonts/Cabin-Medium-TTF.woff2` - Cabin medium font asset used by the app.
- `src/app/fonts/Cabin-Regular-TTF.woff2` - Cabin regular font asset used by the app.
- `src/app/fonts/Cabin-SemiBoldItalic-TTF.woff2` - Cabin semibold italic font asset used by the app.
- `src/app/fonts/Cabin-SemiBold-TTF.woff2` - Cabin semibold font asset used by the app.
- `src/app/global-error.tsx` - Root-level global error boundary UI for unhandled app errors.
- `src/app/globals.css` - Global CSS, Tailwind layer setup, tokens, utility classes, and site-wide styling.
- `src/app/layout.tsx` - Root app layout that applies fonts, metadata, and global wrappers.
- `src/app/login/page.tsx` - Standalone login page.
- `src/app/not-found.tsx` - 404/not-found page.
- `src/app/page.tsx` - Main app entry page that mounts the client-side TrainTracks experience.
- `src/app/profile/setup/page.tsx` - Standalone profile-setup page for finishing username/password profile state.

## `src/components/`

- `src/components/AdminDashboard.tsx` - Compact developer/admin monitor panel showing GPS, zones, trip state, and an event log.
- `src/components/AuthGate.tsx` - Alpha-access PIN gate that blocks the app until the local PIN is entered.
- `src/components/AuthModal.tsx` - Main auth modal for sign-in/sign-up style flows inside the app UI.
- `src/components/ChangeEmailModal.tsx` - Modal that handles email change verification and submission.
- `src/components/ChangePasswordModal.tsx` - Modal that handles password creation/change via Supabase REST flows.
- `src/components/CommandCenter.tsx` - Main dev command center for simulation, route overrides, dev flags, and advanced controls.
- `src/components/CongestionAlert.tsx` - UI alert that surfaces congestion/rush-hour warnings based on station/time heuristics.
- `src/components/DevControls.tsx` - Small floating dev panel for station teleport shortcuts by setting the origin.
- `src/components/DevDashboard.tsx` - Debug location/fare panel that teleports the simulated location to a chosen station.
- `src/components/ErrorBoundary.tsx` - React error boundary wrapper for client-side component failures.
- `src/components/FareSelector.tsx` - Main trip-setup selector for choosing origin, destination, and ticket type.
- `src/components/GeofenceScanner.tsx` - Animated UI indicating station/geofence scanning or detection.
- `src/components/GPSFallbackHandler.tsx` - Full-screen blocker shown when secure GPS/location requirements are not satisfied.
- `src/components/InfoCard.tsx` - Simple summary card showing stops left and fare.
- `src/components/LineExplorer.tsx` - Line-centric explorer for stations, current line state, and visual route browsing.
- `src/components/LiveTrainLayer.tsx` - Map layer that renders live train markers on the explorer map.
- `src/components/LoginSuccessModal.tsx` - Short success-state modal shown after login.
- `src/components/LogoutModal.tsx` - Confirmation modal for sign-out.
- `src/components/MainApp.tsx` - Core app orchestrator that decides what screen, guard, card, overlay, and tracking UI should be active.
- `src/components/MapExplorer.tsx` - Interactive network map with line geometry, stations, and live train overlays.
- `src/components/NearbyStationsCard.tsx` - Card that lists stations nearest to the user's current location.
- `src/components/NoSSR.tsx` - Client-only render wrapper for components that should not render on the server.
- `src/components/NotificationSettingsModal.tsx` - Modal for selecting browser notification preferences and requesting permission.
- `src/components/PanicLogger.tsx` - On-screen crash logger that shows client errors and promise rejections in a visible debug overlay.
- `src/components/ProfileDrawer.tsx` - User profile drawer containing account actions, trip history access, and profile controls.
- `src/components/ProfileSetupModal.tsx` - In-app modal for completing profile setup and password state.
- `src/components/RecentTripsCard.tsx` - Card showing a compact list of recent trips and a view-all entry point.
- `src/components/ReconnectionBanner.tsx` - Top banner shown while GPS or ride state is trying to reconnect.
- `src/components/RegionGuard.tsx` - Geographic access guard intended to restrict usage to allowed Philippine regions.
- `src/components/SecurityGuard.tsx` - Device/inspection/desktop guard that blocks unsupported devices and aggressively resists DevTools usage.
- `src/components/SpectatorInfoCard.tsx` - Main spectator-mode card that shows either selected train details or selected station details.
- `src/components/StallAlert.tsx` - Alert UI for detecting and surfacing stalled-train conditions.
- `src/components/StationInfoModal.tsx` - Rich station-information modal with images, history, and descriptive content from `stationInfo.ts`.
- `src/components/StationTimeline.tsx` - Route timeline component showing previous/current/upcoming stations.
- `src/components/TicketCard.tsx` - Stylized ticket-style trip card showing route, fare, transfer, and ride details.
- `src/components/TrackingCard.tsx` - Main current-location/current-station card shown during active tracking.
- `src/components/TripHistoryModal.tsx` - Full trip-history modal for reviewing saved rides.
- `src/components/TripProgress.tsx` - Large progress/telemetry card showing journey progression, ETA-style hints, transfers, and live status.
- `src/components/UpcomingTrainsCard.tsx` - Card that filters and displays same-line same-direction upcoming trains near the rider.
- `src/components/WrongDirectionAlert.tsx` - Prompt shown when the system believes the user is traveling the wrong direction.

## `src/components/screens/`

- `src/components/screens/ClosedScreen.tsx` - Full-screen lockout shown when the system decides rail service is closed.
- `src/components/screens/HolyWeekScreen.tsx` - Full-screen lockout shown during the hardcoded Holy Week shutdown window.
- `src/components/screens/MaintenanceScreen.tsx` - Full-screen lockout shown when maintenance mode is enabled.
- `src/components/screens/SafetyRules.tsx` - Onboarding/rules screen for safe app use.
- `src/components/screens/TransitRules.tsx` - Onboarding/rules screen focused on transit etiquette/usage reminders.
- `src/components/screens/WelcomeScreen.tsx` - Welcome/onboarding screen used early in the user flow.

## `src/components/ui/`

- `src/components/ui/badge.tsx` - Shared badge primitive.
- `src/components/ui/button.tsx` - Shared button primitive.
- `src/components/ui/card.tsx` - Shared card primitive.
- `src/components/ui/dialog.tsx` - Shared dialog wrapper around Radix dialog primitives.
- `src/components/ui/LoadingScreen.tsx` - Shared loading-screen component.
- `src/components/ui/Marquee.tsx` - Shared marquee/scroller UI helper.

## `src/data/`

- `src/data/congestion.ts` - Station/time congestion heuristics, rush-hour rules, and holiday-aware crowd logic.
- `src/data/fareMatrix.ts` - Static fare matrix used for fare calculations across supported stations.
- `src/data/geofence.ts` - Station geofence definitions used for proximity detection and geofence-based behavior.
- `src/data/lrt1.json` - Line geometry/coordinate data for LRT-1.
- `src/data/lrt2.json` - Line geometry/coordinate data for LRT-2.
- `src/data/mrt3.json` - Line geometry/coordinate data for MRT-3.
- `src/data/mrt7.json` - Line geometry/coordinate data for MRT-7.
- `src/data/segmentDistances.ts` - Segment distance metadata between stations, used by trip/progress/sim logic.
- `src/data/stationInfo.ts` - Rich station reference content such as descriptions, history, images, and trivia.
- `src/data/stations.ts` - Canonical station list plus line metadata, line filtering, and line definitions.
- `src/data/transfers.ts` - Transfer/interchange metadata and walking details used by UI and routing helpers.

## `src/hooks/`

- `src/hooks/useAuth.ts` - Auth/profile hook that loads and updates Supabase-backed profile state.
- `src/hooks/useBackgroundAudio.ts` - Silent-audio keepalive hook used to improve persistence/background behavior on mobile browsers.
- `src/hooks/useCongestionAlert.ts` - Hook that decides when to show congestion alerts based on station/time/context.
- `src/hooks/useDeviceOrientation.ts` - Hook that reads device heading/compass orientation and permission state.
- `src/hooks/useGatekeeper.ts` - Hook that finds the nearest station(s) from the current location and resolves transfer-area conflicts.
- `src/hooks/useGpsCrowdsource.ts` - Hook that reports the user's GPS position into the crowdsource/live-train system.
- `src/hooks/useMaintenanceMode.ts` - Hook that polls Supabase app config and syncs `maintenance_mode` into trip state.
- `src/hooks/useMockTrainEngine.ts` - Hook that generates simulated/mock trains for development or demo use.
- `src/hooks/useOperatingHours.ts` - Hook that determines whether service should be considered open based on local time.
- `src/hooks/useSimEngine.ts` - Simulation engine that advances a simulated ride along the computed route.
- `src/hooks/useSmartLocation.ts` - Main location-fusion hook combining raw GPS, simulated location, snapping, and fallback behavior.
- `src/hooks/useStallDetector.ts` - Hook that detects stalled movement patterns.
- `src/hooks/useTrainPolling.ts` - Polling hook for live TrainSight train data.
- `src/hooks/useTripHistory.ts` - Hook for loading and saving trip-history records through Supabase.
- `src/hooks/useTripLogic.ts` - High-level orchestration hook for trip state, status text, progress, transfer state, and display values.
- `src/hooks/useTripNotifications.ts` - Hook that fires browser notifications for trip milestones.
- `src/hooks/useWakeLock.ts` - Hook that requests and maintains a screen wake lock.
- `src/hooks/useWrongDirection.ts` - Hook that determines when the rider appears to be traveling the wrong direction.

## `src/hooks/trip/`

- `src/hooks/trip/useDeadReckoning.ts` - GPS-silence fallback hook that extrapolates train movement when live GPS disappears.
- `src/hooks/trip/useRouteAlignment.ts` - Hook that snaps rider location to the computed route to stabilize tracking.
- `src/hooks/trip/useStationProgress.ts` - Core trip-progress hook that derives previous/current/next station state and local progress metrics.
- `src/hooks/trip/useTransferLogic.ts` - Transfer/NAV MODE hook that handles walking transitions between lines.

## `src/lib/`

- `src/lib/supabase/client.ts` - Client-side Supabase client factory.
- `src/lib/supabase/middleware.ts` - Shared middleware helper for Supabase session propagation.
- `src/lib/supabase/server.ts` - Server-side Supabase client factory.
- `src/lib/utils.ts` - Shared generic utilities such as class-name merging.

## `src/services/`

- `src/services/trainSightApi.ts` - Client-facing service wrapper for live TrainSight requests.

## `src/store/`

- `src/store/useTrainStore.ts` - Zustand store for live train fleet, crowdsource suppression, spectator selection, and follow-state.
- `src/store/useTripStore.ts` - Main Zustand store for trip setup, computed route, runtime flags, profile preferences, and ride state.

## `src/types/`

- `src/types/index.ts` - Core shared types such as station, coordinates, line IDs, and route-related interfaces.
- `src/types/train.ts` - TrainSight/train-telemetry-specific types and line-mapping constants.

## `src/utils/`

- `src/utils/fareNew.ts` - Fare calculator and fare-breakdown helper using the static matrix and transfer map.
- `src/utils/geo.ts` - Geographic math helpers such as distance, movement, bearings, and station-progress calculation.
- `src/utils/simRoute.ts` - Route builder that assembles same-line and transfer routes from station definitions.
- `src/utils/stationUtils.ts` - UI helper utilities for line colors, badges, themes, and station-related display logic.
- `src/utils/telemetryMapper.ts` - Mapper that converts raw TrainSight telemetry/status text into the app's unified status format.

## System Summary By Responsibility

### Files that define the rail network

- `src/data/stations.ts`
- `src/data/transfers.ts`
- `src/data/segmentDistances.ts`
- `src/data/lrt1.json`
- `src/data/lrt2.json`
- `src/data/mrt3.json`
- `src/data/mrt7.json`

### Files that define live train ingestion

- `src/services/trainSightApi.ts`
- `src/app/api/trainsight/trains/route.ts`
- `src/app/api/trainsight/gps/route.ts`
- `src/hooks/useTrainPolling.ts`
- `src/utils/telemetryMapper.ts`
- `src/store/useTrainStore.ts`

### Files that define rider trip progression

- `src/store/useTripStore.ts`
- `src/hooks/useSmartLocation.ts`
- `src/hooks/useTripLogic.ts`
- `src/hooks/trip/useStationProgress.ts`
- `src/hooks/trip/useTransferLogic.ts`
- `src/hooks/trip/useRouteAlignment.ts`
- `src/hooks/trip/useDeadReckoning.ts`
- `src/hooks/useWrongDirection.ts`
- `src/hooks/useSimEngine.ts`

### Files that define user-facing trip UI

- `src/components/MainApp.tsx`
- `src/components/FareSelector.tsx`
- `src/components/TrackingCard.tsx`
- `src/components/TicketCard.tsx`
- `src/components/TripProgress.tsx`
- `src/components/StationTimeline.tsx`
- `src/components/UpcomingTrainsCard.tsx`
- `src/components/WrongDirectionAlert.tsx`
- `src/components/TripHistoryModal.tsx`

### Files that define explorer / spectator UI

- `src/app/explorer/page.tsx`
- `src/components/MapExplorer.tsx`
- `src/components/LineExplorer.tsx`
- `src/components/LiveTrainLayer.tsx`
- `src/components/SpectatorInfoCard.tsx`
- `src/components/StationInfoModal.tsx`
- `src/components/NearbyStationsCard.tsx`

### Files that define access control / gating

- `src/components/AuthGate.tsx`
- `src/components/SecurityGuard.tsx`
- `src/components/RegionGuard.tsx`
- `src/components/GPSFallbackHandler.tsx`
- `src/hooks/useOperatingHours.ts`
- `src/hooks/useMaintenanceMode.ts`
- `src/components/screens/ClosedScreen.tsx`
- `src/components/screens/MaintenanceScreen.tsx`
- `src/components/screens/HolyWeekScreen.tsx`

## Bottom Line

If you want the shortest truthful summary of the system:

- this is a Metro Manila rail trip assistant with live trains, auto-tracking, transfer guidance, trip history, and strong dev tooling
- `MainApp`, `useTripStore`, `useSmartLocation`, `useTripLogic`, `useTrainPolling`, and the static rail datasets are the main center of gravity
- the app is split between rider-trip mode, spectator/explorer mode, and a substantial dev/debug surface
- Supabase handles auth/profile/history/config, while TrainSight provides live rail telemetry

This document is the "what each file does" companion to the earlier audit report, which focused on "what is wrong and what should be fixed."
