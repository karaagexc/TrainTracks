# TrainTracks Anti-Tamper and DevOps-Only Hardening Plan

Date: 2026-04-11

## Goal

Make production dev/internal capabilities inaccessible to normal users and available only to DevOps-authorized operators.

## First Principle

Client-side anti-inspect is not a real security boundary.

If code is shipped to the browser, it can be inspected, modified, or replayed by a determined user. That means the real answer is not "harder JavaScript tricks." The real answer is:

1. Move trust to the server.
2. Stop shipping privileged controls to untrusted clients.
3. Use anti-tamper only as a deterrence layer, not as the thing protecting access.

If the target is "no one can use production dev features except DevOps," the security boundary must be server-side and infrastructure-side.

## Current Risk Areas

### Client-trusted dev state

- [useTripStore.ts](/c:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts) currently holds `isDevMode` in client state and exposes `enableDevMode()`.
- [MainApp.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx) conditionally renders internal tooling from that client state.
- [RegionGuard.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/RegionGuard.tsx) and [useOperatingHours.ts](/c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useOperatingHours.ts) treat dev mode as a bypass.

### Admin route unlocks client state

- [/admin page](/c:/Users/Exelec/Downloads/TrainTracks/src/app/admin/page.tsx) verifies admin status, then flips the client-side dev flag.
- Once the client has the privileged UI, browser-side anti-tamper can only slow inspection, not prevent it.

### Internal tooling is bundled into the main app

- [CommandCenter.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/CommandCenter.tsx) contains route override, mock/live switching, maintenance toggles, notification tests, and other internal controls.
- If this component is in the production client bundle, the attack surface already exists even when hidden.

### SecurityGuard is only a deterrent

- [SecurityGuard.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/SecurityGuard.tsx) can block desktop use and devtools behavior, but it cannot stop a motivated user from inspecting delivered code.

## Target Architecture

### Public app

- No privileged controls bundled.
- No client-side "unlock" flag.
- No public hints that internal access exists.

### DevOps console

- Separate trust boundary.
- Server-authenticated.
- Role-checked on every request.
- Ideally separated by route group or separate deployment/subdomain.

### Anti-tamper layer

- Production-only.
- Aggressive deterrence is acceptable.
- Must sit on top of real authorization, not replace it.

## Implementation Plan

### Phase 1: Remove client-trusted privilege as the security boundary

Objective: dev access must be derived from a server-authorized session, not local state.

Actions:

1. Replace `isDevMode` as the root source of trust.
2. Keep a client flag only as a mirrored UI convenience value hydrated from a verified server session.
3. Remove any ability to grant privileged mode by local storage, session storage, Zustand actions, or URL-only flows.

Code impact:

- [useTripStore.ts](/c:/Users/Exelec/Downloads/TrainTracks/src/store/useTripStore.ts)
- [MainApp.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx)
- [RegionGuard.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/RegionGuard.tsx)
- [useOperatingHours.ts](/c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useOperatingHours.ts)

Success condition:

- Flipping client state alone can never unlock internal controls in production.

### Phase 2: Put `/admin` behind server-side authorization

Objective: the admin route must be rejected before the client app gets a useful page.

Actions:

1. Add route protection in `middleware.ts` for `/admin`.
2. Read the Supabase session server-side.
3. Verify `is_admin = true` or an equivalent signed role claim.
4. Reject unauthorized requests with redirect or 403 before rendering the page.
5. Add MFA requirement for admin-capable accounts.

Preferred hardening:

- Allowlist DevOps emails or group membership.
- Require recent authentication.
- Require MFA.

Code impact:

- New `middleware.ts`
- New server auth helper under `src/lib`
- [admin page](/c:/Users/Exelec/Downloads/TrainTracks/src/app/admin/page.tsx)

Success condition:

- Non-DevOps users cannot reach admin UI even if they know the route.

### Phase 3: Stop shipping internal tooling in the public bundle

Objective: hidden controls should not exist in the normal production client bundle.

Actions:

1. Move [CommandCenter.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/CommandCenter.tsx) and related internal panels to an admin-only route/layout.
2. Remove internal tool imports from [MainApp.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/MainApp.tsx).
3. If some operator tools must stay in the main deployment, dynamically import them only after server-verified admin context is present.
4. Disable mock engine, route override, maintenance controls, and internal monitors from the public entrypoint.

Best option:

- Separate DevOps console deployment or subdomain, for example `ops.<domain>`.

Success condition:

- Public production bundle does not contain the dangerous tooling surface.

### Phase 4: Move privileged mutations behind server APIs

Objective: even if a user reproduces internal UI calls, the backend rejects them.

Actions:

1. Route maintenance-mode writes through a protected API handler.
2. Put line-mode changes, simulation toggles, and future internal mutations behind server routes.
3. Require authenticated admin session on those routes.
4. Log all privileged mutations with actor, timestamp, and IP.

Code impact:

- [useMaintenanceMode.ts](/c:/Users/Exelec/Downloads/TrainTracks/src/hooks/useMaintenanceMode.ts)
- [CommandCenter.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/CommandCenter.tsx)
- New `/api/admin/*` endpoints

Success condition:

- Replaying requests from a non-DevOps session fails server-side.

### Phase 5: Restore and strengthen anti-tamper as a deterrence layer

Objective: make casual inspection and tampering painful in production while keeping the real boundary server-side.

Recommended production-only controls:

1. Block right-click and common inspection shortcuts.
2. Detect devtools via viewport-gap and timing heuristics.
3. On detection, replace the app with a sterile blocker screen.
4. Remove sensitive DOM content from the visible tree when blocked.
5. Suppress nonessential console output in production.
6. Add randomized check intervals to reduce trivial bypass scripts.
7. Trigger telemetry when tamper is detected.

Stricter variant:

1. Keep the DOM-replacement behavior.
2. Clear visible app nodes and freeze interaction.
3. Force reload on close.
4. Pair with an ops-only bypass that is granted by server session, not exposed in copy.

Rules:

- No UI text should mention admin access, dev mode, bypasses, or internal routes.
- Any bypass must be identity-based and server-granted.
- Anti-tamper only runs in production.

Code impact:

- [SecurityGuard.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/components/SecurityGuard.tsx)
- [layout.tsx](/c:/Users/Exelec/Downloads/TrainTracks/src/app/layout.tsx)

Success condition:

- Casual users and low-effort inspectors get blocked immediately.

### Phase 6: Infrastructure hardening

Objective: make production ops access depend on identity and network controls, not app code.

Recommended controls:

1. Put `/admin` or the DevOps console behind Cloudflare Access, Tailscale Funnel, a VPN, or another Zero Trust gateway.
2. Add IP allowlisting for DevOps if feasible.
3. Consider device trust or hardware-backed passkeys for admin-capable accounts.
4. Separate admin origin from public origin if possible.
5. Set restrictive CSP and security headers.

Best practical model:

- Public app on normal origin.
- DevOps console on separate protected origin.
- Zero Trust gate before app auth.

Success condition:

- Even knowing the route is useless without identity and network approval.

### Phase 7: Monitoring and tripwires

Objective: know when someone is probing the system.

Actions:

1. Log devtools-detected events.
2. Log blocked `/admin` attempts.
3. Log failed privileged API calls.
4. Alert on repeated tamper attempts or unusual admin-route traffic.
5. Add honey strings or fake internal markers in public builds and alert if they are referenced.

Success condition:

- You learn about probing instead of only hoping the blocker worked.

### Phase 8: CI and release gates

Objective: prevent future accidental leaks.

Actions:

1. Add CI check that fails if public copy contains strings like `dev mode`, `admin access`, `CommandCenter`, `mock`, or similar internal terms where they should not exist.
2. Add CI grep for `NEXT_PUBLIC_` secrets.
3. Add bundle inspection checks for internal-only modules in the public build.
4. Add production E2E tests verifying:
   - `/admin` is blocked for normal users
   - internal controls do not render on the public app
   - anti-tamper blocker contains no internal hints

Success condition:

- Shipping another accidental leak becomes difficult.

## Recommended Strict Build

If the requirement is truly "no one can use live production internal features except DevOps," this is the recommended final shape:

1. Public app has no internal console in its bundle.
2. DevOps console lives on a separate protected route or subdomain.
3. Access requires server-verified admin role plus MFA.
4. Access is additionally gated by Zero Trust or IP allowlist.
5. SecurityGuard runs in production as deterrence only and reveals nothing about internal access.
6. All privileged actions require server authorization and are fully logged.

## What I Would Implement First

Order of execution:

1. Server-protect `/admin` with middleware and role verification.
2. Remove CommandCenter from the public app bundle.
3. Move privileged writes to protected server APIs.
4. Restore a production-only strict SecurityGuard with no internal wording.
5. Add CI leak checks and logging.

## Hard Truth

You cannot make a browser app literally uninspectable.

You can, however, make sure that:

- inspection reveals nothing useful,
- internal tooling is not shipped publicly,
- privileged actions are impossible without DevOps identity,
- tampering attempts are blocked, logged, and unattractive.

That is the correct way to "beat the game" on production.
