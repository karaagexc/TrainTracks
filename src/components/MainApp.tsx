"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from 'next/dynamic';
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTripStore } from "@/store/useTripStore";
import { useTrainStore } from "@/store/useTrainStore";
import { createClient } from "@/lib/supabase/client";
import { GPSFallbackHandler } from "@/components/GPSFallbackHandler";
import { ReconnectionBanner } from "@/components/ReconnectionBanner";
import { CommandCenter } from "@/components/CommandCenter";
import { NearbyStationsCard } from "@/components/NearbyStationsCard";
import { LineExplorer } from "@/components/LineExplorer";
import { TicketCard } from "@/components/TicketCard";
import { TripProgress } from "@/components/TripProgress";
import { FareSelector } from "@/components/FareSelector";
import { SpectatorInfoCard } from "@/components/SpectatorInfoCard";
import { UpcomingTrainsCard } from "@/components/UpcomingTrainsCard";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { WrongDirectionAlert } from "@/components/WrongDirectionAlert";
import { CongestionAlert } from "@/components/CongestionAlert";
import { StallAlert } from "@/components/StallAlert";
import { ServiceDisruptionBanner } from "@/components/ServiceDisruptionBanner";
import AuthModal from "@/components/AuthModal";
import ProfileDrawer from "@/components/ProfileDrawer";
import ProfileSetupModal from "@/components/ProfileSetupModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import RecentTripsCard from "@/components/RecentTripsCard";
import TripHistoryModal from "@/components/TripHistoryModal";

import { useTripLogic } from "@/hooks/useTripLogic";
import { useJourneyRuntime } from "@/hooks/useJourneyRuntime";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { useRealtimeTrainPresence } from "@/hooks/useTrainPolling";
import { usePredictedTrainPresence } from "@/hooks/usePredictedTrainPresence";
import { useGpsCrowdsource } from "@/hooks/useGpsCrowdsource";
import { useMockTrainEngine } from "@/hooks/useMockTrainEngine";
import { useLocationStore } from "@/store/useLocationStore";
import { useAuth } from "@/hooks/useAuth";
import { useTripHistory } from "@/hooks/useTripHistory";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { Bell, Map as MapIcon, Sun, Moon, Settings, Users, User, Eye, Radio, ShieldCheck, X } from "lucide-react";
import { useOfflineRuntime } from "@/hooks/useOfflineRuntime";
import { useTripPersistence } from "@/hooks/useTripPersistence";
import { useWakeLock } from "@/hooks/useWakeLock";
import { getThemeColors } from "@/utils/stationUtils";
import { useGatekeeper } from "@/hooks/useGatekeeper";
import { useOperatingHours } from "@/hooks/useOperatingHours";
import { cn } from "@/lib/utils";
import { getStationProximity } from "@/domain/location/stationProximity";
import { getOperationalMode } from "@/domain/railway";
import { ClosedScreen } from "@/components/screens/ClosedScreen";
import { MaintenanceScreen } from "@/components/screens/MaintenanceScreen";
import { HolyWeekScreen } from "@/components/screens/HolyWeekScreen";
// New Screens
import { WelcomeScreen } from "@/components/screens/WelcomeScreen";
import { JourneySafetyReminders } from "@/components/screens/JourneySafetyReminders";

// Dynamic Import for Map (No SSR)
const MapExplorer = dynamic(() => import('@/components/MapExplorer'), { ssr: false });

function RuntimeServices() {
    const tripActive = useTripStore((state) => state.status === 'WAITING' || state.status === 'TRANSIT');
    useWakeLock(tripActive);
    useRealtimeTrainPresence();
    useOfflineRuntime();
    useTripPersistence();
    usePredictedTrainPresence();
    useMockTrainEngine();
    useMaintenanceMode();
    useJourneyRuntime();
    useGpsCrowdsource();
    return null;
}

function MainAppShell() {
    const [mounted, setMounted] = useState(false);
    const [isFareSelectorOpen, setIsFareSelectorOpen] = useState(false);
    const [isMapBlurred, setIsMapBlurred] = useState(false); // Map Blur State

    const isOpen = useOperatingHours();

    const {
        isDevMode, isGpsOverride, status, origin, ticketType, destination,
        direction, runningFare, nextStation, currentStation,
        isDarkMode, toggleDarkMode,
        showRushHour, toggleShowRushHour, darkModeOverride, setDarkMode,
        notificationPreference, setNotificationPreference,
        maintenanceMode,
        line7Mode,
        transitMode,
        setTransitMode
    } = useTripStore();
    const isBusSandboxEnabled = isDevMode;
    const isBusMode = isBusSandboxEnabled && transitMode === 'bus';

    // Train Tracking
    const { spectatorMode, toggleSpectatorMode, crowdConsent, setCrowdConsent, isBroadcasting } = useTrainStore();

    // Hamburger menu state
    const [menuOpen, setMenuOpen] = useState(false);
    const [crowdModalOpen, setCrowdModalOpen] = useState(false);

    useEffect(() => {
        if (!isBusSandboxEnabled && transitMode === 'bus') {
            setTransitMode('train');
            return;
        }
        if (!isBusMode) return;
        useTrainStore.getState().setSpectatorMode(false);
        useTrainStore.getState().selectTrain(null);
        useTrainStore.getState().selectStation(null);
        useTrainStore.getState().setPredictedTrains([]);
    }, [isBusMode, isBusSandboxEnabled, transitMode, setTransitMode]);

    // Auth state
    const { user, profile, loading: authLoading, signOut, isAuthenticated, needsSetup } = useAuth();
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [profileSetupOpen, setProfileSetupOpen] = useState(false);
    const [profileSetupEditMode, setProfileSetupEditMode] = useState(false);
    const [passwordResetMode, setPasswordResetMode] = useState(false);
    const [tripHistoryOpen, setTripHistoryOpen] = useState(false);

    // Trip History
    const { recentTrips, allTrips, stats: tripStats, loading: tripHistoryLoading, fetchAllTrips, saveTrip } = useTripHistory();

    // Auto-save trip when status transitions to ARRIVED
    // Uses Zustand subscribe (synchronous) instead of useEffect (async/deferred)
    // to capture state BEFORE the TicketCard auto-close timer resets the store.
    const saveTripRef = useRef(saveTrip);
    saveTripRef.current = saveTrip;

    useEffect(() => {
        const unsub = useTripStore.subscribe((state, prev) => {
            if (state.status !== 'ARRIVED' || prev.status === 'ARRIVED') return;

            // State is captured synchronously — origin/dest are still set
            const tripOrigin = state.origin;
            const tripDest = state.destination || state.currentStation;
            const ticket = state.ticketType || (state.origin?.lineId === 'EDSA' ? 'BUS_REGULAR' : 'SJT');

            console.log('[TripSave] ARRIVED transition detected', {
                origin: tripOrigin?.name,
                dest: tripDest?.name,
                ticketType: state.ticketType,
                fare: state.runningFare,
                direction: state.direction,
                tripStartedAt: state.tripStartedAt,
            });

            if (!tripOrigin || !tripDest) {
                console.warn('[TripSave] ❌ Missing origin or dest — skipping save');
                return;
            }

            const distKm = (state.journeySnapshot.route?.totalDistanceMeters ?? 0) / 1000;
            const clientTripId = `tt-${state.tripStartedAt ?? Date.now()}-${tripOrigin.id}-${tripDest.id}`;
            const durationMins = state.tripStartedAt
                ? Math.round((Date.now() - state.tripStartedAt) / 60000)
                : null;

            saveTripRef.current({
                client_trip_id: clientTripId,
                origin_id: tripOrigin.id,
                origin_name: tripOrigin.name,
                destination_id: tripDest.id,
                destination_name: tripDest.name,
                line_id: tripOrigin.lineId,
                destination_line_id: tripDest.lineId !== tripOrigin.lineId ? tripDest.lineId : null,
                ticket_type: ticket,
                fare: state.runningFare,
                distance_km: Math.round(distKm * 100) / 100,
                direction: state.direction,
                duration_minutes: durationMins,
                started_at: state.tripStartedAt
                    ? new Date(state.tripStartedAt).toISOString()
                    : new Date().toISOString(),
            });
        });
        return unsub;
    }, []);

    // Auto-open profile setup for new users (needsSetup is gated by !loading in useAuth)
    useEffect(() => {
        if (isAuthenticated && needsSetup && !authLoading && mounted) {
            setProfileSetupOpen(true);
            setProfileSetupEditMode(false);
        }
    }, [isAuthenticated, needsSetup, authLoading, mounted]);

    // Password reset detection: check URL param and listen for PASSWORD_RECOVERY event
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Check URL for reset_password param
        const params = new URLSearchParams(window.location.search);
        if (params.get('reset_password') === 'true') {
            // Clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete('reset_password');
            window.history.replaceState({}, '', url.pathname);
        }

        // Listen for Supabase PASSWORD_RECOVERY event
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
            if (event === 'PASSWORD_RECOVERY') {
                setPasswordResetMode(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Follow the device theme while the persisted preference is set to system.
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const syncSystemTheme = () => {
            if (useTripStore.getState().themePreference !== 'system') return;
            setDarkMode(media.matches);
        };
        syncSystemTheme();
        media.addEventListener?.('change', syncSystemTheme);
        return () => media.removeEventListener?.('change', syncSystemTheme);
    }, [setDarkMode]);


    // Gatekeeper Hook (Scanning Logic)
    const {
        nearest,
        conflicts,
        loading: scanningLoading,
        isOverride,
        locationStatus,
        requestLocation,
    } = useGatekeeper();
    const { setOrigin } = useTripStore();

    // Logic Hook
    const {
        statusText, statusCode, displayStation, legProgress, totalProgress,
        visualPrev, visualNext, stopsRemaining, distanceToNext, distanceToDest,
        stopsToTransfer, stopsAfterTransfer, nextLegLineId, gpsFallbackActive,
        isTransferActive, transferFrom, transferTo, transferEdge, transferTargetLineId,
        transferInstruction, transferRouteDescription, transferTargetCoordinates,
        transferDistanceMeters, transferTurnDirection
    } = useTripLogic();


    // Notifications Hook
    const { requestPermission, permission } = useTripNotifications(statusText, displayStation, {
        statusCode,
        transferTargetLineId,
    });

    useEffect(() => {
        console.log("MainApp: Mounting...");
        setMounted(true);
    }, []);

    // Auto-open FareSelector if origin is set but no ticket
    useEffect(() => {
        if (origin && !ticketType && !isFareSelectorOpen && status === 'IDLE') {
            setIsFareSelectorOpen(true);
        }
    }, [origin, ticketType, isFareSelectorOpen, status]);

    // If not mounted (client hydration not done), show Full Screen Black Loader to prevent White Flash
    if (!mounted) {
        return <LoadingScreen />;
    }

    // Determine if it's currently Holy Week (April 1-3, 2026)
    const isHolyWeek = (() => {
        const now = new Date();
        const start = new Date('2026-04-01T00:00:00+08:00');
        const end = new Date('2026-04-04T00:00:00+08:00');
        return now >= start && now < end;
    })();

    // Show Holy Week Screen (highest priority, non-dev users only)
    if (isHolyWeek && !isDevMode) {
        return <HolyWeekScreen />;
    }

    // Show Maintenance Screen (non-dev users only)
    if (maintenanceMode && !isDevMode) {
        return <MaintenanceScreen />;
    }

    // Show Closed Screen if outside operating hours (and not in dev mode)
    if (!isOpen && !isBusMode) {
        return <ClosedScreen />;
    }

    return (
        <ErrorBoundary>
            <main className="relative h-screen w-full bg-black overflow-hidden font-sans select-none">

                {/* 1. Background Map Layer */}
                <div className={`absolute inset-0 z-0 transition-all duration-700 ease-out ${isMapBlurred ? 'blur-md opacity-50' : 'opacity-100'}`}>
                    <MapExplorer />
                </div>
                {/* Settings Cog — Fixed to device screen top-left */}
                {/* In dev mode: below the CommandCenter toggle. In real-world: takes its position */}
                <div className={cn(
                    "fixed left-4 transition-all duration-300",
                    isDevMode ? 'top-[4.5rem]' : 'top-4',
                    isMapBlurred
                        ? "z-0 opacity-0 pointer-events-none scale-90"
                        : "z-[60] opacity-100 scale-100"
                )}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="flex items-center justify-center bg-black/80 text-white p-3 rounded-full border border-zinc-800 shadow-xl transition-all hover:scale-105 active:scale-95"
                        aria-label="Settings Menu"
                    >
                        <Settings className={`w-6 h-6 text-white/80 transition-transform duration-500 ${menuOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {menuOpen && (
                        <div className="absolute left-0 mt-2 w-52 bg-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                            <button
                                onClick={toggleDarkMode}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                            >
                                {isDarkMode ? (
                                    <Sun className="w-4 h-4 text-yellow-400 fill-yellow-400/20 group-hover:rotate-90 transition-transform duration-500" />
                                ) : (
                                    <Moon className="w-4 h-4 text-blue-300 fill-blue-300/20 group-hover:-rotate-12 transition-transform duration-500" />
                                )}
                                <span className="text-xs font-bold text-white/80">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                                {darkModeOverride === null && (
                                    <span className="ml-auto text-[9px] text-white/30 font-mono">AUTO</span>
                                )}
                            </button>

                            <button
                                onClick={toggleShowRushHour}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                            >
                                <Users className={`w-4 h-4 ${showRushHour ? 'text-amber-400' : 'text-white/40'} transition-colors`} />
                                <span className="text-xs font-bold text-white/80">Rush Hour</span>
                                <span className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${showRushHour ? 'text-amber-400' : 'text-white/30'}`}>
                                    {showRushHour ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            {!isBusMode && (
                                <button
                                    onClick={() => {
                                        if (crowdConsent === 'granted') {
                                            setCrowdConsent('denied');
                                        } else {
                                            setCrowdModalOpen(true);
                                        }
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                                >
                                    <Users className={`w-4 h-4 ${crowdConsent === 'granted' ? 'text-cyan-400' : 'text-white/40'} transition-colors`} />
                                    <span className="text-xs font-bold text-white/80">Crowd Signal</span>
                                    <span className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${isBroadcasting ? 'text-cyan-400' : crowdConsent === 'granted' ? 'text-emerald-400' : 'text-white/30'}`}>
                                        {isBroadcasting ? 'LIVE' : crowdConsent === 'granted' ? 'ON' : 'OFF'}
                                    </span>
                                </button>
                            )}

                            {/* Notifications Toggle (Tri-State Cycle) */}
                            <button
                                onClick={async () => {
                                    // If permission not granted yet, request it first
                                    if (permission !== 'granted') {
                                        await requestPermission();
                                        return;
                                    }
                                    // Cycle: all → destination → none → all
                                    const cycle: Record<string, 'all' | 'destination' | 'none'> = {
                                        'all': 'destination',
                                        'destination': 'none',
                                        'none': 'all'
                                    };
                                    setNotificationPreference(cycle[notificationPreference]);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                            >
                                <Bell className={`w-4 h-4 transition-colors ${permission !== 'granted' ? 'text-white/40' :
                                    notificationPreference === 'all' ? 'text-green-400' :
                                        notificationPreference === 'destination' ? 'text-blue-400' : 'text-white/40'
                                    }`} />
                                <span className="text-xs font-bold text-white/80">Alerts</span>
                                <span className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${permission !== 'granted' ? 'text-white/30' :
                                    notificationPreference === 'all' ? 'text-green-400' :
                                        notificationPreference === 'destination' ? 'text-blue-400' : 'text-white/30'
                                    }`}>
                                    {permission !== 'granted' ? 'OFF' :
                                        notificationPreference === 'all' ? 'ALL' :
                                            notificationPreference === 'destination' ? 'DEST' : 'OFF'}
                                </span>
                            </button>


                        </div>
                    )}
                </div>

                {/* Profile Button — Fixed to device screen top-right (mirrors settings cog) */}
                <div className={cn(
                    "fixed right-4 transition-all duration-300",
                    isDevMode ? 'top-[4.5rem]' : 'top-4',
                    isMapBlurred
                        ? "z-0 opacity-0 pointer-events-none scale-90"
                        : "z-[60] opacity-100 scale-100"
                )}>
                    <button
                        onClick={() => {
                            if (isAuthenticated) {
                                setProfileMenuOpen(true);
                            } else {
                                setAuthModalOpen(true);
                            }
                        }}
                        className="flex items-center justify-center bg-black/80 text-white p-3 rounded-full border border-zinc-800 shadow-xl transition-all hover:scale-105 active:scale-95 overflow-hidden"
                        aria-label={isAuthenticated ? 'Profile Menu' : 'Sign In'}
                    >
                        {isAuthenticated && profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={profile.avatar_url}
                                alt="Profile"
                                className="w-6 h-6 rounded-full object-cover"
                            />
                        ) : isAuthenticated ? (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500/30 to-blue-500/30 flex items-center justify-center">
                                <span className="text-[10px] font-black text-white/80">
                                    {profile?.display_name?.[0]?.toUpperCase() || profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                                </span>
                            </div>
                        ) : (
                            <User className="w-6 h-6 text-white/80" />
                        )}
                    </button>
                </div>

                {/* GPS Reconnection Banner — always rendered, self-gated by store state */}
                <ReconnectionBanner />

                {/* 2. Scrollable Content Overlay (The "Sheet") */}
                <div
                    className="absolute inset-0 z-10 overflow-y-auto w-full h-full no-scrollbar scroll-smooth pointer-events-none"
                    onScroll={(e) => {
                        const scrollTop = e.currentTarget.scrollTop;
                        // Blur map when scrolled past 100px (when sheet starts covering more)
                        setIsMapBlurred(scrollTop > 50);
                    }}
                >
                    {/* Transparent Spacer - Allows interaction with Map below */}
                    {/* Adjust height to position cards initially */}
                    <div className="h-[50vh] w-full" />

                    {/* The Actual Card Content - Now Transparent with Floating Cards */}
                    <div className="relative z-20 p-4 pb-20 md:p-8 md:pb-24 lg:p-12 lg:pb-28 min-h-screen transition-colors duration-500 pointer-events-auto">

                        {/* Drag Handle / Mode Toggle - Centered */}
                        <div className="flex items-center justify-center mb-6 md:mb-8">
                            {!origin ? (
                                <div className="flex flex-col items-center gap-2">
                                    <div className="flex items-center bg-black/40 backdrop-blur-xl p-1 rounded-full shadow-2xl border border-white/10 relative">
                                        {/* Animated sliding background pill */}
                                        <div
                                            className={cn(
                                                "absolute top-1 bottom-1 w-[120px] rounded-full transition-all duration-300 ease-out pointer-events-none",
                                                (!spectatorMode || isBusMode) ? "left-1 bg-white" : "left-[121px] bg-blue-500"
                                            )}
                                        />

                                        <button
                                            onClick={() => spectatorMode && toggleSpectatorMode()}
                                            className={cn(
                                                "relative z-10 w-[120px] py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors duration-300",
                                                (!spectatorMode || isBusMode) ? "text-black" : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            Companion
                                        </button>

                                        <button
                                            onClick={() => !spectatorMode && !isBusMode && toggleSpectatorMode()}
                                            disabled={isBusMode}
                                            className={cn(
                                                "relative z-10 w-[120px] py-1.5 rounded-full flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-widest uppercase transition-colors duration-300",
                                                (spectatorMode && !isBusMode) ? "text-white" : "text-white/40"
                                            )}
                                        >
                                            <Eye className={cn("w-3 h-3", (spectatorMode && !isBusMode) ? "text-white" : "text-white/40")} />
                                            {isBusMode ? 'Rail only' : 'Spectator'}
                                        </button>
                                    </div>
                                    {isBusSandboxEnabled && (
                                        <div className="flex items-center bg-black/40 backdrop-blur-xl p-1 rounded-full shadow-xl border border-white/10 relative">
                                            <div
                                                className={cn(
                                                    "absolute top-1 bottom-1 w-[80px] rounded-full transition-all duration-300 ease-out pointer-events-none",
                                                    isBusMode ? "left-[81px] bg-amber-400" : "left-1 bg-white"
                                                )}
                                            />
                                            <button
                                                onClick={() => setTransitMode('train')}
                                                className={cn(
                                                    "relative z-10 w-[80px] py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors duration-300",
                                                    !isBusMode ? "text-black" : "text-white/60 hover:text-white"
                                                )}
                                                aria-pressed={!isBusMode}
                                            >
                                                Train
                                            </button>
                                            <button
                                                onClick={() => setTransitMode('bus')}
                                                className={cn(
                                                    "relative z-10 w-[80px] py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors duration-300",
                                                    isBusMode ? "text-black" : "text-white/60 hover:text-white"
                                                )}
                                                aria-pressed={isBusMode}
                                            >
                                                Bus
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-12 md:w-16 h-1.5 bg-black/20 backdrop-blur-md rounded-full shadow-sm transition-all duration-300" />
                            )}
                        </div>


                        {isDevMode && (
                            <div className="mb-4">
                                <GPSFallbackHandler />
                                <CommandCenter backgroundMode={isMapBlurred} />
                                {isDevMode && isGpsOverride && (
                                    <div className="absolute top-4 right-8 z-50 pointer-events-none">
                                        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-red-500/50 shadow-lg">
                                            SIMULATION
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* GPS Fallback Indicator (Hidden in Sim Mode) */}
                        {gpsFallbackActive && !isGpsOverride && (
                            <div className="flex justify-center mb-3">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(251, 191, 36, 0.2))',
                                        backdropFilter: 'blur(16px)',
                                        WebkitBackdropFilter: 'blur(16px)',
                                        border: '1px solid rgba(245, 158, 11, 0.35)',
                                        boxShadow: '0 0 20px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
                                    }}>
                                    <span className="text-base">📡</span>
                                    <span className="text-amber-300 text-xs font-semibold tracking-wider uppercase">GPS Fallback</span>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-300"></span>
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Persistent Friendly Reminder for Alerts (If not granted) */}
                        {permission === 'default' && (
                            <div className="flex justify-center mb-4 animate-in fade-in slide-in-from-top-4 duration-700">
                                <button
                                    onClick={requestPermission}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-all group backdrop-blur-md"
                                >
                                    <Bell className="w-3 h-3 text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold text-blue-300 tracking-wide uppercase">Enable Live Alerts</span>
                                </button>
                            </div>
                        )}

                        {/* ALERTS (Direction, Congestion, Stall) */}
                        {origin && !isBusMode && (
                            <>
                                <WrongDirectionAlert
                                    onUpdateOrigin={() => {
                                        console.log("🔘 WrongDirectionAlert: 'I'm at [Station]' clicked");
                                        try {
                                            const { updateOriginKeepTrip } = useTripStore.getState();
                                            const location = useLocationStore.getState().sample?.location ?? null;
                                            // Find nearest station
                                            if (location) {
                                                console.log("📍 Location found:", location);
                                                const closest = getStationProximity({
                                                    location,
                                                    mode: getOperationalMode(isDevMode, line7Mode),
                                                    line7Mode,
                                                    transitMode: isBusMode ? 'bus' : 'train',
                                                }).closest?.station ?? null;
                                                console.log("🚉 Nearest station found:", closest?.name);
                                                // Trip-safe: preserves destination + status + direction
                                                if (closest) {
                                                    updateOriginKeepTrip(closest);
                                                    console.log("✅ Origin updated via updateOriginKeepTrip");
                                                }
                                            } else {
                                                console.error("❌ Location is null during 'I'm at [Station]' click");
                                            }
                                        } catch (err) {
                                            console.error("💥 Error in onUpdateOrigin:", err);
                                        }
                                    }}
                                    onChangeDestination={() => {
                                        console.log("🔘 WrongDirectionAlert: 'Going somewhere else' clicked");
                                        try {
                                            const { updateOriginKeepTrip } = useTripStore.getState();
                                            const location = useLocationStore.getState().sample?.location ?? null;
                                            // Find nearest station and update origin (trip-safe)
                                            if (location) {
                                                const closest = getStationProximity({
                                                    location,
                                                    mode: getOperationalMode(isDevMode, line7Mode),
                                                    line7Mode,
                                                    transitMode: isBusMode ? 'bus' : 'train',
                                                }).closest?.station ?? null;
                                                if (closest) updateOriginKeepTrip(closest);
                                            }
                                            // Don't null destination — let fare selector handle it
                                            // Old destination stays as fallback if user dismisses
                                            setIsFareSelectorOpen(true);
                                        } catch (err) {
                                            console.error("💥 Error in onChangeDestination:", err);
                                        }
                                    }}
                                />
                                <ServiceDisruptionBanner />
                                <CongestionAlert />
                                <StallAlert />
                            </>
                        )}

                        {/* Main Widgets Container */}
                        <div className="space-y-6 md:space-y-8 max-w-md md:max-w-2xl lg:max-w-3xl mx-auto">

                            {/* Spectator Mode: Show SpectatorInfoCard exclusively (when no active trip) */}
                            {spectatorMode && !origin && !isBusMode && (
                                <ErrorBoundary>
                                    <SpectatorInfoCard />
                                </ErrorBoundary>
                            )}

                            {/* Normal Flow: TicketCard + UpcomingTrains + TripProgress */}
                            {(!spectatorMode || origin) && (
                            <ErrorBoundary>
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <TicketCard
                                        origin={origin}
                                        ticketType={ticketType}
                                        direction={direction}
                                        runningFare={runningFare}
                                        onTicketClick={() => setIsFareSelectorOpen(true)}
                                        nextStation={visualNext}
                                        prevStation={visualPrev}
                                        progress={legProgress}
                                        statusText={statusText}
                                        displayStation={displayStation}
                                        isTransferActive={isTransferActive}
                                        transferFrom={transferFrom}
                                        transferTo={transferTo}
                                        transferTargetLineId={transferTargetLineId}
                                        // Scanning Props
                                        scanningState={{
                                            loading: scanningLoading,
                                            nearest: nearest || null,
                                            conflicts,
                                            isOverride,
                                            locationStatus,
                                            isRequestingLocation: locationStatus.code === 'checking',
                                            onRequestLocation: requestLocation,
                                            onRide: (station) => {
                                                setOrigin(station);
                                                setIsFareSelectorOpen(true);
                                            }
                                        }}
                                        onManualEntry={isDevMode ? () => setIsFareSelectorOpen(true) : undefined}
                                    />

                                    {/* Upcoming Trains — between TicketCard and TripProgress */}
                                    {origin && !isBusMode && (
                                        <ErrorBoundary>
                                            <UpcomingTrainsCard />
                                        </ErrorBoundary>
                                    )}

                                    {/* Only show TripProgress if we have an Origin (Trip Started) */}
                                    {origin && (
                                        <TripProgress
                                            key={destination?.id || 'no-dest'}
                                            prev={null}
                                            current={currentStation}
                                            next={nextStation}
                                            progress={legProgress}
                                            totalProgress={totalProgress}
                                            origin={origin}
                                            destination={destination}
                                            ticketType={ticketType}
                                            runningFare={runningFare}
                                            stopsRemaining={stopsRemaining}
                                            statusText={statusText}
                                            statusCode={statusCode}
                                            distanceToNext={distanceToNext}
                                            distanceToDest={distanceToDest}
                                            stopsToTransfer={stopsToTransfer}
                                            stopsAfterTransfer={stopsAfterTransfer}
                                            nextLegLineId={nextLegLineId}
                                            isTransferActive={isTransferActive}
                                            transferFrom={transferFrom}
                                            transferTo={transferTo}
                                            transferEdge={transferEdge}
                                            transferTargetLineId={transferTargetLineId}
                                            transferInstruction={transferInstruction}
                                            transferRouteDescription={transferRouteDescription}
                                            transferTargetCoordinates={transferTargetCoordinates}
                                            transferDistanceMeters={transferDistanceMeters}
                                            transferTurnDirection={transferTurnDirection}
                                        />
                                    )}
                                </div>
                            </ErrorBoundary>
                            )}

                            {origin && !isBusMode && (
                                <ErrorBoundary>
                                    <LineExplorer />
                                </ErrorBoundary>
                            )}

                            {/* Recent Trips Card — shown when no active trip */}
                            {!origin && isAuthenticated && (
                                <ErrorBoundary>
                                    <RecentTripsCard
                                        trips={recentTrips}
                                        onViewAll={() => setTripHistoryOpen(true)}
                                    />
                                </ErrorBoundary>
                            )}

                        </div>
                    </div>
                </div>

                {/* Modals - Rendered OUTSIDE the scroll container to prevent overflow clipping */}
                <ErrorBoundary>
                    <FareSelector open={isFareSelectorOpen} onOpenChange={setIsFareSelectorOpen} />
                    <WelcomeScreen />
                    <JourneySafetyReminders />
                </ErrorBoundary>

                {crowdModalOpen && !isBusMode && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center px-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div
                            className="relative w-full max-w-sm"
                            style={{ animation: 'csModalIn 500ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                        >
                            {/* Glow effect behind modal */}
                            <div className="absolute -inset-5 bg-gradient-to-b from-cyan-500/15 via-blue-500/8 to-transparent rounded-[2.5rem] blur-3xl pointer-events-none" />

                            <div className="relative overflow-hidden rounded-3xl border border-white/[0.12] bg-zinc-950/80 backdrop-blur-3xl backdrop-saturate-150 shadow-[0_32px_100px_rgba(0,0,0,0.7)]">
                                {/* Top highlight line */}
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />

                                {/* Ambient gradient blobs */}
                                <div className="absolute -top-20 -right-20 w-48 h-48 bg-cyan-500/[0.06] rounded-full blur-[80px] pointer-events-none" />
                                <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-blue-500/[0.06] rounded-full blur-[60px] pointer-events-none" />

                                {/* Close Button */}
                                <button
                                    onClick={() => setCrowdModalOpen(false)}
                                    className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
                                    aria-label="Close Crowd Signal modal"
                                >
                                    <X className="h-4 w-4" />
                                </button>

                                <div className="relative z-10 p-6">
                                    {/* Hero Icon with Signal Rings */}
                                    <div className="flex flex-col items-center text-center mb-6 pt-2">
                                        <div className="relative mb-5 w-20 h-20">
                                            {/* Expanding signal rings */}
                                            <div
                                                className="absolute inset-0 rounded-full border border-cyan-400/15"
                                                style={{ animation: 'csRingExpand 2.5s ease-out infinite' }}
                                            />
                                            <div
                                                className="absolute inset-0 rounded-full border border-cyan-400/10"
                                                style={{ animation: 'csRingExpand 2.5s ease-out infinite 0.8s' }}
                                            />
                                            {/* Glow aura */}
                                            <div
                                                className="absolute -inset-2 rounded-full pointer-events-none"
                                                style={{
                                                    background: 'radial-gradient(circle, rgba(103,232,249,0.08) 0%, transparent 70%)',
                                                    animation: 'csPulseGlow 3s ease-in-out infinite',
                                                }}
                                            />
                                            {/* Icon container */}
                                            <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-xl border border-cyan-400/20 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(103,232,249,0.1)] overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 to-transparent" />
                                                <Radio className="w-9 h-9 text-cyan-300 relative z-10" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <span className="text-[9px] font-bold tracking-[0.3em] text-cyan-400/50 uppercase">Crowd Signal</span>
                                            <h2 className="text-xl font-black tracking-tight text-white">Share your train presence?</h2>
                                            <p className="text-sm text-white/50 leading-relaxed max-w-[280px] mx-auto">
                                                Help fellow commuters by anonymously broadcasting your position while riding.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Feature Cards */}
                                    <div className="grid grid-cols-3 gap-2 mb-6">
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <ShieldCheck className="mx-auto mb-2 h-4 w-4 text-emerald-400" />
                                            <p className="text-[10px] font-bold text-white/70 mb-0.5">Anonymous</p>
                                            <p className="text-[8px] text-white/30 leading-tight">No identity shared</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <MapIcon className="mx-auto mb-2 h-4 w-4 text-blue-400" />
                                            <p className="text-[10px] font-bold text-white/70 mb-0.5">Auto-stop</p>
                                            <p className="text-[8px] text-white/30 leading-tight">Only on built lines</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <Users className="mx-auto mb-2 h-4 w-4 text-purple-400" />
                                            <p className="text-[10px] font-bold text-white/70 mb-0.5">Opt-in</p>
                                            <p className="text-[8px] text-white/30 leading-tight">Revoke anytime</p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => {
                                                setCrowdConsent('denied');
                                                setCrowdModalOpen(false);
                                            }}
                                            className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-bold uppercase tracking-wider text-white/60 transition-all hover:bg-white/10 hover:text-white/80 active:scale-[0.97]"
                                        >
                                            Not Now
                                        </button>
                                        <button
                                            onClick={() => {
                                                setCrowdConsent('granted');
                                                setCrowdModalOpen(false);
                                            }}
                                            className="h-12 rounded-2xl bg-cyan-400 px-4 text-xs font-black uppercase tracking-wider text-zinc-950 shadow-[0_8px_32px_rgba(103,232,249,0.25)] transition-all hover:bg-cyan-300 active:scale-[0.97]"
                                        >
                                            Enable
                                        </button>
                                    </div>

                                    {/* Privacy reassurance */}
                                    <p className="text-center text-[9px] text-white/20 mt-4 font-medium">
                                        No login, name, or trip history is ever sent.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Keyframes for signal ring animations */}
                        <style jsx>{`
                            @keyframes csModalIn {
                                from {
                                    opacity: 0;
                                    transform: scale(0.95) translateY(10px);
                                }
                                to {
                                    opacity: 1;
                                    transform: scale(1) translateY(0);
                                }
                            }
                            @keyframes csRingExpand {
                                0% { opacity: 0.6; transform: scale(1); }
                                100% { opacity: 0; transform: scale(1.6); }
                            }
                            @keyframes csPulseGlow {
                                0%, 100% { opacity: 0.5; transform: scale(1); }
                                50% { opacity: 1; transform: scale(1.1); }
                            }
                        `}</style>
                    </div>
                )}

                {/* Auth Modal */}
                <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

                {/* Profile Drawer */}
                <ProfileDrawer
                    isOpen={profileMenuOpen}
                    onClose={() => setProfileMenuOpen(false)}
                    profile={profile}
                    userEmail={user?.email}
                    onSignOut={() => {
                        setProfileMenuOpen(false);
                        signOut();
                    }}
                    onEditProfile={() => {
                        setProfileSetupOpen(true);
                        setProfileSetupEditMode(true);
                    }}
                />

                {/* Profile Setup Modal */}
                <ProfileSetupModal
                    isOpen={profileSetupOpen}
                    onClose={() => setProfileSetupOpen(false)}
                    editMode={profileSetupEditMode}
                />

                {/* Password Reset Modal (triggered by email reset link) */}
                <ChangePasswordModal
                    isOpen={passwordResetMode}
                    onClose={() => setPasswordResetMode(false)}
                    userEmail={user?.email || ''}
                    mode="reset"
                />

                {/* Trip History Modal */}
                <TripHistoryModal
                    isOpen={tripHistoryOpen}
                    onClose={() => setTripHistoryOpen(false)}
                    trips={allTrips}
                    stats={tripStats}
                    loading={tripHistoryLoading}
                    onLoad={fetchAllTrips}
                />
            </main>
        </ErrorBoundary >
    );
}

export default function MainApp() {
    return (
        <>
            <RuntimeServices />
            <MainAppShell />
        </>
    );
}