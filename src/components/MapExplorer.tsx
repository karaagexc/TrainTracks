"use client";

import { memo, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // Import Leaflet CSS
import { Line7Mode, LineId, OperationalMode, Station, TransitMode } from '@/types';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { TrainPresence } from '@/types/train';
import { useSmartLocation } from '@/hooks/useSmartLocation';
import { getDistanceKm } from '@/utils/geo';
import { getCongestionLevel, shouldDisplayCongestionOverlay, CongestionTier } from '@/data/congestion';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { LiveTrainLayer } from '@/components/LiveTrainLayer';
import clsx from 'clsx';
import lrt1Data from '@/data/lrt1.json';
import lrt2Data from '@/data/lrt2.json';
import mrt3Data from '@/data/mrt3.json';
import mrt7Data from '@/data/mrt7.json';
import edsaData from '@/data/edsa_carousel.json';
import { EDSA_COLOR } from '@/data/edsaStops';
import { getNetworkStations, getOperationalMode } from '@/domain/railway';
import { getStationDwellSummary } from '@/domain/trainPresence';
import { getDirectionBadgePlacements, getDirectionBadgePositionStyle } from '@/utils/trainMarker';
import { getNetworkProfile } from '@/domain/network/runtime';
import { buildCartoBasemapUrl, CARTO_BASEMAP_ATTRIBUTION } from '@/domain/map/cartoBasemap';

// Fix for default Leaflet markers in Next.js
const iconRetinaUrl = '/leaflet/marker-icon-2x.png';
const iconUrl = '/leaflet/marker-icon.png';
const shadowUrl = '/leaflet/marker-shadow.png';
const EMPTY_DWELLING_TRAINS: TrainPresence[] = [];
const EMPTY_DWELLING_MAP = new Map<string, TrainPresence[]>();

function stableAnimationOffset(key: string, durationMs: number): number {
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
        hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }
    return durationMs > 0 ? hash % durationMs : 0;
}const STATION_MARKER_ANIMATION_STYLES = `
    @keyframes tt-simple-fade {
        0%, 45% { opacity: 1; transform: scale(1); }
        50%, 95% { opacity: 0; transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
    }
    @keyframes tt-simple-fade-reverse {
        0%, 45% { opacity: 0; transform: scale(0.9); }
        50%, 95% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.9); }
    }
    @keyframes tt-color-shift {
        0%, 45% { border-color: rgba(255,255,255,0.2); box-shadow: none; }
        50%, 95% { border-color: var(--tt-congestion-color); box-shadow: 0 0 14px var(--tt-congestion-glow); }
        100% { border-color: rgba(255,255,255,0.2); box-shadow: none; }
    }
    @keyframes tt-icon-bg-shift {
        0%, 45% { background-color: var(--tt-line-color); }
        50%, 95% { background-color: var(--tt-congestion-color); }
        100% { background-color: var(--tt-line-color); }
    }
    @keyframes tt-dot-ring-shift {
        0%, 45% { border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
        50%, 95% { border: 3px solid var(--tt-congestion-color); box-shadow: 0 0 10px var(--tt-congestion-glow); }
        100% { border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    }
    @keyframes tt-station-bloom {
        0% { transform: scale(1); opacity: 0.7; }
        70%, 100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes tt-pill-expand {
        0% { max-width: 28px; padding: 0; border-radius: 50%; opacity: 0.8; transform: scale(0.6); }
        40% { max-width: 28px; padding: 0; border-radius: 50%; opacity: 1; transform: scale(1); }
        100% { max-width: 300px; padding: 6px 14px; border-radius: 9999px; transform: scale(1); }
    }
    @keyframes tt-pill-collapse {
        0% { max-width: 300px; padding: 6px 14px; border-radius: 9999px; transform: scale(1); opacity: 1; }
        50% { max-width: 28px; padding: 0; border-radius: 50%; opacity: 1; transform: scale(1); }
        100% { max-width: 28px; padding: 0; border-radius: 50%; opacity: 0.8; transform: scale(0.6); }
    }
    @keyframes tt-content-reveal {
        0%, 40% { opacity: 0; max-width: 0; }
        100% { opacity: 1; max-width: 200px; }
    }
    @keyframes tt-content-hide {
        0% { opacity: 1; max-width: 200px; }
        60%, 100% { opacity: 0; max-width: 0; }
    }
    @keyframes tt-phase-2-1 {
        0%, 45% { opacity: 1; max-width: 200px; margin-left: 8px; }
        50%, 95% { opacity: 0; max-width: 0; margin-left: 0; }
        100% { opacity: 1; max-width: 200px; margin-left: 8px; }
    }
    @keyframes tt-phase-2-2 {
        0%, 45% { opacity: 0; max-width: 0; margin-left: 0; }
        50%, 95% { opacity: 1; max-width: 200px; margin-left: 8px; }
        100% { opacity: 0; max-width: 0; margin-left: 0; }
    }
    @keyframes tt-phase-3-1 {
        0%, 30% { opacity: 1; max-width: 200px; margin-left: 8px; }
        33%, 96% { opacity: 0; max-width: 0; margin-left: 0; }
        100% { opacity: 1; max-width: 200px; margin-left: 8px; }
    }
    @keyframes tt-phase-3-2 {
        0%, 30% { opacity: 0; max-width: 0; margin-left: 0; }
        33%, 63% { opacity: 1; max-width: 200px; margin-left: 8px; }
        66%, 100% { opacity: 0; max-width: 0; margin-left: 0; }
    }
    @keyframes tt-phase-3-3 {
        0%, 63% { opacity: 0; max-width: 0; margin-left: 0; }
        66%, 96% { opacity: 1; max-width: 200px; margin-left: 8px; }
        100% { opacity: 0; max-width: 0; margin-left: 0; }
    }
    @keyframes common-station-colors {
        0%, 100% { fill: #800000; }
        33% { fill: #22c55e; }
        66% { fill: #eab308; }
    }
`;

// Custom component to handle map interaction and auto-centering
function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
    const map = useMap();
    const [isInteracting, setIsInteracting] = useState(false);
    const isInteractingRef = useRef(false);
    const snapBackTimerRef = useRef<number | null>(null);
    const cameraFrameRef = useRef<number | null>(null);

    const beginInteraction = useCallback(() => {
        isInteractingRef.current = true;
        setIsInteracting(true);
        if (snapBackTimerRef.current) window.clearTimeout(snapBackTimerRef.current);
    }, []);

    const startSnapBackTimer = useCallback(() => {
        if (!isInteractingRef.current) return;
        if (snapBackTimerRef.current) window.clearTimeout(snapBackTimerRef.current);
        snapBackTimerRef.current = window.setTimeout(() => {
            isInteractingRef.current = false;
            setIsInteracting(false);
        }, 10000);
    }, []);

    useMapEvents({
        dragstart: beginInteraction,
        zoomstart: (event) => {
            if ((event as { originalEvent?: unknown }).originalEvent) beginInteraction();
        },
        dragend: startSnapBackTimer,
        zoomend: startSnapBackTimer,
    });

    useEffect(() => {
        if (isInteracting) return;

        if (cameraFrameRef.current !== null) {
            window.cancelAnimationFrame(cameraFrameRef.current);
        }

        cameraFrameRef.current = window.requestAnimationFrame(() => {
            cameraFrameRef.current = null;
            const offsetYPx = 150;
            const targetPoint = map.project(center, zoom);
            const targetCenter = map.unproject(targetPoint.add([0, offsetYPx]), zoom);
            const distanceMeters = map.distance(map.getCenter(), targetCenter);

            if (distanceMeters < 2 && map.getZoom() === zoom) return;

            map.stop();
            if (distanceMeters < 250 && map.getZoom() === zoom) {
                map.panTo(targetCenter, {
                    animate: true,
                    duration: 0.8,
                    easeLinearity: 0.5,
                });
            } else {
                map.flyTo(targetCenter, zoom, {
                    animate: true,
                    duration: 1,
                    easeLinearity: 0.25,
                });
            }
        });

        return () => {
            if (cameraFrameRef.current !== null) {
                window.cancelAnimationFrame(cameraFrameRef.current);
            }
        };
    }, [center, zoom, isInteracting, map]);

    useEffect(() => () => {
        if (snapBackTimerRef.current) window.clearTimeout(snapBackTimerRef.current);
        if (cameraFrameRef.current !== null) window.cancelAnimationFrame(cameraFrameRef.current);
    }, []);

    return null;
}
// Handle Map Background Clicks (Deselect)
function MapClickHandler({ onDeselect }: { onDeselect: () => void }) {
    useMapEvents({
        click: () => {
            onDeselect();
        },
    });
    return null;
}

// Fix Map Deformation/Rendering Issues
function MapResizer() {
    const map = useMap();

    useEffect(() => {
        let frame: number | null = null;
        const invalidate = () => {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                map.invalidateSize({ pan: false, animate: false, debounceMoveend: true });
            });
        };

        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(invalidate)
            : null;
        observer?.observe(map.getContainer());
        window.addEventListener('resize', invalidate, { passive: true });
        window.visualViewport?.addEventListener('resize', invalidate, { passive: true });
        invalidate();

        return () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener('resize', invalidate);
            window.visualViewport?.removeEventListener('resize', invalidate);
        };
    }, [map]);

    return null;
}
const LINE_COLORS: Record<string, string> = {
    'LRT1': '#22c55e', // green-500
    'LRT2': '#a855f7', // purple-500
    'MRT3': '#eab308', // yellow-500
    'MRT7': '#800000', // maroon
    'EDSA': EDSA_COLOR, // EDSA Carousel
};

const LINE_PATH_OPTIONS: Record<string, { color: string; weight: number; opacity: number; lineCap: 'round'; lineJoin: 'round' }> = {
    LRT1: { color: LINE_COLORS.LRT1, weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' },
    LRT2: { color: LINE_COLORS.LRT2, weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' },
    MRT3: { color: LINE_COLORS.MRT3, weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' },
    MRT7: { color: LINE_COLORS.MRT7, weight: 6, opacity: 0.8, lineCap: 'round', lineJoin: 'round' },
    EDSA: { color: LINE_COLORS.EDSA, weight: 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round' },
};

// Helper to extract Leaflet-ready lat/lng arrays from GeoJSON
const processGeoJson = (data: any): [number, number][][] => {
    const lines: [number, number][][] = [];
    data.features.forEach((feature: any) => {
        if (feature.geometry.type === 'MultiLineString') {
            feature.geometry.coordinates.forEach((segment: number[][]) => {
                // GeoJSON is [lon, lat], Leaflet needs [lat, lon]
                const latLngs = segment.map(coord => [coord[1], coord[0]] as [number, number]);
                lines.push(latLngs);
            });
        } else if (feature.geometry.type === 'LineString') {
            const latLngs = feature.geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
            lines.push(latLngs);
        }
    });
    return lines;
};

const LINE_SEGMENTS: Record<LineId, [number, number][][]> = {
    LRT1: processGeoJson(lrt1Data),
    LRT2: processGeoJson(lrt2Data),
    MRT3: processGeoJson(mrt3Data),
    MRT7: processGeoJson(mrt7Data),
    EDSA: processGeoJson(edsaData),
};

function getVisibleLineIds(operationalMode: OperationalMode, line7Mode: Line7Mode, transitMode: TransitMode): LineId[] {
    if (transitMode === 'bus') return ['EDSA'];

    const lineIds: LineId[] = ['LRT1', 'LRT2', 'MRT3'];
    if (operationalMode === 'sandbox' && line7Mode !== 'OFF') {
        lineIds.push('MRT7');
    }
    return lineIds;
}

const RailLinesLayer = memo(function RailLinesLayer({
    operationalMode,
    line7Mode,
    transitMode,
}: {
    operationalMode: OperationalMode;
    line7Mode: Line7Mode;
    transitMode: TransitMode;
}) {
    return (
        <>
            {getVisibleLineIds(operationalMode, line7Mode, transitMode).map((lineId) => (
                LINE_SEGMENTS[lineId].map((positions, idx) => (
                    <Polyline
                        key={`${lineId}-${idx}`}
                        positions={positions}
                        pathOptions={LINE_PATH_OPTIONS[lineId]}
                        smoothFactor={0}
                    />
                ))
            ))}
        </>
    );
});

function parseTrainPositionSignature(signature: string | null): { id: string; lat: number; lng: number } | null {
    if (!signature) return null;
    const [id, lat, lng] = signature.split('|');
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!id || !Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
    return { id, lat: parsedLat, lng: parsedLng };
}

function MapCameraFollower({
    activeTrainPosition,
    selectedStation,
    filteredStations,
}: {
    activeTrainPosition: { id: string; lat: number; lng: number } | null;
    selectedStation: Station | null;
    filteredStations: Station[];
}) {
    const status = useTripStore((state) => state.status);
    const currentStation = useTripStore((state) => state.currentStation);
    const { location } = useSmartLocation();

    const target = useMemo(() => {
        if (activeTrainPosition) {
            return { center: [activeTrainPosition.lat, activeTrainPosition.lng] as [number, number], zoom: 15 };
        }

        if (selectedStation) {
            return { center: [selectedStation.latitude, selectedStation.longitude] as [number, number], zoom: 15 };
        }

        if (status !== 'IDLE' && status !== 'ARRIVED' && location) {
            if (currentStation && getDistanceKm(location, currentStation) < 0.2) {
                return { center: [currentStation.latitude, currentStation.longitude] as [number, number], zoom: 14 };
            }
            return { center: [location.latitude, location.longitude] as [number, number], zoom: 15 };
        }

        if (currentStation) {
            if (location && getDistanceKm(location, currentStation) >= 0.2) {
                return { center: [location.latitude, location.longitude] as [number, number], zoom: 15 };
            }
            return { center: [currentStation.latitude, currentStation.longitude] as [number, number], zoom: 14 };
        }

        if (location) {
            let nearestStation: Station | null = null;
            let minDistance = Infinity;
            filteredStations.forEach((station) => {
                const distance = getDistanceKm(location, station);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestStation = station;
                }
            });
            if (nearestStation) {
                const station = nearestStation as Station;
                return { center: [station.latitude, station.longitude] as [number, number], zoom: 14 };
            }
            return { center: [location.latitude, location.longitude] as [number, number], zoom: 14 };
        }

        return { center: [14.6091, 121.0223] as [number, number], zoom: 12 };
    }, [activeTrainPosition, currentStation, filteredStations, location, selectedStation, status]);

    return <MapController center={target.center} zoom={target.zoom} />;
}
function MapExplorer({ className }: { className?: string }) {
    const currentStation = useTripStore((s) => s.currentStation);
    const isDarkMode = useTripStore((s) => s.isDarkMode);
    const showRushHour = useTripStore((s) => s.showRushHour);
    const dataMode = useTripStore((s) => s.dataMode);
    const line7Mode = useTripStore((s) => s.line7Mode);
    const isDevMode = useTripStore((s) => s.isDevMode);
    const rawTransitMode = useTripStore((s) => s.transitMode);
    const transitMode = isDevMode ? rawTransitMode : 'train';
    const congestionConfig = useTripStore((s) => s.congestionConfig);
    const congestionNow = useMinuteClock();
    const networkProfile = getNetworkProfile(dataMode);
    const useLowBandwidthTiles = networkProfile.saveData
        || networkProfile.effectiveType === 'slow-2g'
        || networkProfile.effectiveType === '2g';
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const operationalMode = getOperationalMode(isDevMode, line7Mode);
    const filteredStations = useMemo(
        () => getNetworkStations(operationalMode, line7Mode, transitMode),
        [operationalMode, line7Mode, transitMode],
    );


    const [LeafletData, setLeafletData] = useState<any>(null); // For dynamic L access

    // Pill Visibility Logic helper
    const shouldShowPill = useCallback((station: Station) => {
        // 1. Always show if manually selected (Free Roam)
        if (selectedStation?.id === station.id) return true;

        // 2. Current Station Logic — pill stays locked on currentStation
        // during TRANSIT until store.currentStation changes (next station captured at <175m)
        if (currentStation?.id === station.id) {
            return true;
        }
        return false;
    }, [currentStation?.id, selectedStation?.id]);

    // Track collapsing/expanding explicitly for robust animations
    const [collapsingId, setCollapsingId] = useState<string | null>(null);
    const [expandingId, setExpandingId] = useState<string | null>(null);
    const prevSelectedRef = useRef<Station | null>(null);

    useEffect(() => {
        // 1. Deselection (Collapse)
        if (prevSelectedRef.current && prevSelectedRef.current.id !== selectedStation?.id) {
            setCollapsingId(prevSelectedRef.current.id);
            setTimeout(() => setCollapsingId(null), 500);
        }
        // 2. Selection (Expand)
        if (selectedStation && selectedStation.id !== prevSelectedRef.current?.id) {
            setExpandingId(selectedStation.id);
            setTimeout(() => setExpandingId(null), 500);
        }
        prevSelectedRef.current = selectedStation;
    }, [selectedStation]);

    // Track previous pill states for non-selection transitions
    const prevPillsRef = useRef(new Set<string>());

    // Update prevPillsRef AFTER render (for next cycle)
    const currentPills = useMemo(() => {
        const nextPills = new Set<string>();
        filteredStations.forEach(s => {
            if (shouldShowPill(s)) nextPills.add(s.id);
        });
        return nextPills;
    }, [filteredStations, shouldShowPill]);
    useEffect(() => {
        prevPillsRef.current = currentPills;
    });

    // Load Leaflet on Client Side Only
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const L = require('leaflet');
            // Apply the marker fix here, after L is loaded
            // @ts-ignore
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: iconRetinaUrl,
                iconUrl: iconUrl,
                shadowUrl: shadowUrl,
            });
            setLeafletData(L);
        }
    }, []);

    // Create Custom Icons for Stations
    const createStationIcon = useCallback((station: any, isSelected: boolean, isCurrent: boolean, wasPill: boolean, isCollapsingState: boolean, isExpandingState: boolean, dwellingTrains: TrainPresence[] = []) => {
        if (!LeafletData) return undefined;

        const { lineId, name, id } = station;
        const color = LINE_COLORS[lineId] || '#ffffff';
        const isPill = isSelected || isCurrent;

        // Determine Animation Mode
        // Expand: Explicit State OR Transient State
        const isExpanding = isExpandingState || (isPill && !wasPill);
        // Collapse: Explicit State OR Transient State
        const isCollapsing = isCollapsingState || (!isPill && wasPill);

        // Force render as Pill if collapsing (to show the exit animation)
        const renderAsPill = isPill || isCollapsing;

        // Congestion data
        const congestion = showRushHour && station.lineId !== 'EDSA'
            ? getCongestionLevel(id, congestionNow, undefined, lineId, congestionConfig, dwellingTrains, operationalMode)
            : null;
        const hasSignificantCongestion = shouldDisplayCongestionOverlay(congestion);

        const TIER_COLORS: Record<CongestionTier, string> = {
            EXTREME: '#f97316',
            HIGH: '#f59e0b',
            MODERATE: '#eab308',
            LOW: '#22c55e',
        };
        const congestionColor = congestion ? TIER_COLORS[congestion.tier] : 'transparent';
        const congestionLabel = congestion?.label || '';

        const cabinFont = `font-family: var(--font-cabin), Cabin, system-ui, sans-serif;`;

        // Global-time sync helper: ensures CSS animations survive Leaflet icon re-creation
        // by calculating a negative delay that resumes the animation from where it should be.
        const getAnimSync = (durationS: number) => {
            const durationMs = durationS * 1000;
            const offset = stableAnimationOffset(id, durationMs);
            return `animation-delay: -${offset}ms;`;
        };

        // Dwelling Setup
        const dwellSummary = getStationDwellSummary(dwellingTrains, id);
        const isDwelling = dwellSummary.trainCount > 0;
        const confirmedDwellingCount = dwellSummary.confirmedTrainCount;
        const expectedDwellingCount = dwellSummary.expectedTrainCount;
        const dwellingSignalCount = dwellSummary.signalCount;
        const hasOnlyStaleDwelling = isDwelling && dwellSummary.hasStaleSignal && !dwellSummary.hasFreshSignal;
        const dwellingDirections = new Set<string>();
        dwellSummary.directions.forEach(direction => {
            const dirLower = (direction || '').toLowerCase();
            if (dirLower.includes('north')) dwellingDirections.add('NORTH');
            if (dirLower.includes('south')) dwellingDirections.add('SOUTH');
            if (dirLower.includes('east')) dwellingDirections.add('EAST');
            if (dirLower.includes('west')) dwellingDirections.add('WEST');
        });

        // Dynamic Pill Rotations
        const numPhases = hasSignificantCongestion ? (isDwelling ? 3 : 2) : (isDwelling ? 2 : 1);
        let nameAnim = `margin-left: 8px;`;
        let congestionAnim = `display: none;`;
        let dwellingAnim = `display: none;`;
        const duration = numPhases * 5; // 5s per phase
        const phaseSync = getAnimSync(duration);

        if (numPhases === 2 && !isCollapsing) {
            nameAnim = `animation: tt-phase-2-1 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            if (hasSignificantCongestion) {
                congestionAnim = `animation: tt-phase-2-2 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            } else if (isDwelling) {
                dwellingAnim = `animation: tt-phase-2-2 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            }
        } else if (numPhases === 3 && !isCollapsing) {
            nameAnim = `animation: tt-phase-3-1 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            congestionAnim = `animation: tt-phase-3-2 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            dwellingAnim = `animation: tt-phase-3-3 ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
        }

        // Dwelling label shows train count + direction
        let dwellingLabel = '';
        if (isDwelling) {
            const dirs = Array.from(dwellingDirections);
            const labelCount = confirmedDwellingCount > 0 ? confirmedDwellingCount : expectedDwellingCount;
            const signalSuffix = confirmedDwellingCount > 0 && dwellingSignalCount > confirmedDwellingCount ? ` / ${dwellingSignalCount} signals` : '';
            const expectedSuffix = confirmedDwellingCount > 0 && expectedDwellingCount > 0 ? ` + ${expectedDwellingCount} Expected` : '';

            if (confirmedDwellingCount === 0 && expectedDwellingCount > 0 && dirs.length === 1) {
                dwellingLabel = `${labelCount} Expected / ${dirs[0].charAt(0) + dirs[0].slice(1).toLowerCase()}`;
            } else if (confirmedDwellingCount === 0 && expectedDwellingCount > 0) {
                dwellingLabel = `${labelCount} Expected`;
            } else if (labelCount === 1 && dirs.length === 1) {
                dwellingLabel = `1 Train / ${dirs[0].charAt(0) + dirs[0].slice(1).toLowerCase()}`;
            } else if (labelCount === 1) {
                dwellingLabel = `1 Train Docked`;
            } else {
                dwellingLabel = `${labelCount} Trains Docked`;
            }
            dwellingLabel = `${dwellingLabel}${expectedSuffix}${signalSuffix}`;
            if (hasOnlyStaleDwelling) {
                dwellingLabel = `${dwellingLabel} / stale`;
            }
        }

        if (renderAsPill) {
            // PILL STYLE
            // Determine Animation Classes
            let containerAnim = '';
            let contentAnim = '';

            if (isExpanding) {
                containerAnim = `animation: tt-pill-expand 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;`;
                contentAnim = `animation: tt-content-reveal 0.5s ease-out forwards;`;
            } else if (isCollapsing) {
                containerAnim = `animation: tt-pill-collapse 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;`;
                contentAnim = `animation: tt-content-hide 0.3s ease-in forwards;`;
            } else if (hasSignificantCongestion) {
                containerAnim = `animation: tt-color-shift ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`;
            } else {
                containerAnim = `border: 1.5px solid rgba(255,255,255,0.2);`;
            }

            const isCommonStation = id === 'M7-01'; // Apply ONLY to the actual Common Station

            const iconBgStyle = hasSignificantCongestion && !isCollapsing
                ? `animation: tt-icon-bg-shift ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}`
                : `background-color: ${color};`;
            
            const iconBgHtml = isCommonStation ? `
                <svg width="28" height="28" viewBox="0 0 24 24" style="${hasSignificantCongestion && !isCollapsing ? `fill: ${congestionColor}; transition: fill 0.3s;` : `animation: common-station-colors 5s ease-in-out infinite;`}">
                    <path d="M12 2.5a2 2 0 0 1 1.732 1l9 15.588A2 2 0 0 1 21 22.5H3a2 2 0 0 1-1.732-3.412l9-15.588A2 2 0 0 1 12 2.5z" />
                </svg>
            ` : `
                <div style="width: 100%; height: 100%; border-radius: 50%; ${iconBgStyle}"></div>
            `;

            return LeafletData.divIcon({
                className: 'custom-station-pill',
                html: `
                    <div style="position: relative; display: inline-flex; align-items: center; justify-content: center; width: max-content; transform: translateX(-50%); ${cabinFont}">
                        <!-- Glow Effect (Hidden if collapsing) -->
                        ${!isCollapsing ? `<div style="position: absolute; inset: 0; filter: blur(16px); border-radius: 9999px; transform: scale(1.1); background: ${color}40;"></div>` : ''}
                        
                        <!-- Main Pill Container -->
                        <div style="
                            position: relative; display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 9999px;
                            --tt-line-color: ${color}; --tt-congestion-color: ${congestionColor}; --tt-congestion-glow: ${congestionColor}50;
                            background-color: rgba(9, 9, 11, 0.88); backdrop-filter: blur(12px);
                            border: 1.5px solid transparent;
                            overflow: hidden;
                            ${containerAnim}
                            ${isCurrent && !isCollapsing ? 'box-shadow: 0 0 0 2px rgba(255,255,255,0.35);' : ''}
                        ">
                            <!-- Icon Base -->
                            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-width: 28px; color: white;">
                                <div style="position: absolute; inset: 0;">${iconBgHtml}</div>
                                <div style="position: relative; z-index: 10; display: flex; align-items: center; justify-content: center;">
                                ${hasSignificantCongestion && !isCollapsing ? `
                                    <div style="position: relative; width: 14px; height: 14px;">
                                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; animation: tt-simple-fade ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h3"/><path d="M5 16h3"/><path d="M12 2a10 10 0 0 1 10 10v4a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-4a10 10 0 0 1 10-10Z"/><path d="m8 10 3 3"/><path d="m16 10-3 3"/></svg>
                                        </div>
                                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; animation: tt-simple-fade-reverse ${duration}s cubic-bezier(0.4, 0, 0.2, 1) infinite; ${phaseSync}">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                        </div>
                                    </div>
                                ` : `
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16h3"/><path d="M5 16h3"/><path d="M12 2a10 10 0 0 1 10 10v4a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-4a10 10 0 0 1 10-10Z"/><path d="m8 10 3 3"/><path d="m16 10-3 3"/></svg>
                                `}
                                </div>
                            </div>

                            <!-- Label -->
                            <div style="display: flex; align-items: center; white-space: nowrap; ${contentAnim}">
                                <span style="display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: white; overflow: visible; ${!isCollapsing ? nameAnim : 'margin-left: 8px;'} ${cabinFont}">${name}</span>
                                ${hasSignificantCongestion && !isCollapsing ? `<span style="display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: ${congestionColor}; overflow: visible; ${congestionAnim} ${cabinFont}">${congestionLabel}</span>` : ''}
                                ${isDwelling && !isCollapsing ? `<span style="display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: rgba(255,255,255,0.7); overflow: visible; ${dwellingAnim} ${cabinFont}">${dwellingLabel}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `,
                iconSize: [0, 0],
                iconAnchor: [0, 22],
            });
        } else {
            // DOT / DWELLING STYLE
            const isCommonStation = id === 'M7-01';

            if (isDwelling && LeafletData) {
                const imgUrl = `/gps-markers/${String(lineId ?? '').toLowerCase().replace('-', '')}.png`;
                const bgColor = hasSignificantCongestion ? congestionColor : 'white';
                const bloomSync = getAnimSync(1.8);
                
                const arrowsHtml = getDirectionBadgePlacements(dwellSummary.directions)
                    .map(({ anchor, rotationDegrees }) => `
                        <div style="position: absolute; ${getDirectionBadgePositionStyle(anchor)} background: ${color}; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4); z-index: 10;">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${rotationDegrees}deg);">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                        </div>
                    `)
                    .join('');
                // Bloom pulse ring — radiates outward from station when dwelling
                const bloomHtml = `
                    <div style="position: absolute; inset: -4px; border-radius: 50%; border: 2.5px solid ${color}; animation: tt-station-bloom 1.8s ease-out infinite; ${bloomSync} pointer-events: none;"></div>
                    <div style="position: absolute; inset: -4px; border-radius: 50%; border: 2.5px solid ${color}; animation: tt-station-bloom 1.8s ease-out infinite; ${bloomSync} animation-delay: -${stableAnimationOffset(`${id}:bloom`, 1800) + 600}ms; pointer-events: none;"></div>
                `;

                const iconHtml = `
                    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background-color: ${bgColor}; border-radius: 50%; border: 3px solid ${color}; box-shadow: 0 2px 6px rgba(0,0,0,0.5); transition: background-color 0.3s ease;">
                        ${bloomHtml}
                        <img src="${imgUrl}" alt="Train" onerror="this.style.display='none'" style="width: 85%; height: 85%; object-fit: contain; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.3)); z-index: 5; position: relative;" />
                        ${arrowsHtml}
                    </div>
                `;

                return LeafletData.divIcon({
                    className: 'custom-station-icon dwelling',
                    html: `
                        ${iconHtml}
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                });
            }
            
            const dotSync = getAnimSync(10);
            const dotStyle = hasSignificantCongestion
                ? `animation: tt-dot-ring-shift 10s infinite; ${dotSync}`
                : `border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);`;

            const iconHtml = isCommonStation ? `
                <div style="width: 24px; height: 24px; position: relative;">
                    <svg width="24" height="24" viewBox="0 0 24 24" stroke="white" stroke-width="2" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); animation: common-station-colors 5s ease-in-out infinite;">
                        <path d="M12 2.5a2 2 0 0 1 1.732 1l9 15.588A2 2 0 0 1 21 22.5H3a2 2 0 0 1-1.732-3.412l9-15.588A2 2 0 0 1 12 2.5z" />
                    </svg>
                </div>
            ` : `
                <div style="width: 16px; height: 16px; position: relative;">
                    <div style="
                        background-color: ${color};
                        --tt-line-color: ${color};
                        --tt-congestion-color: ${congestionColor};
                        --tt-congestion-glow: ${congestionColor}50;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        ${dotStyle}
                        cursor: pointer;
                        animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
                    "></div>
                </div>
            `;

            return LeafletData.divIcon({
                className: 'custom-station-icon',
                html: `
                    ${iconHtml}
                `,
                iconSize: isCommonStation ? [24, 24] : [16, 16],
                iconAnchor: isCommonStation ? [12, 12] : [8, 8],
            });
        }
    }, [LeafletData, congestionConfig, congestionNow, operationalMode, showRushHour]);

    // Spectator Mode: train selection/follow centering
    const activeTrainPositionSignature = useTrainStore((s) => {
        if (transitMode === 'bus') return null;
        if (!s.spectatorMode) return null;
        const activeTrainId = s.followedTrainId || s.selectedTrainId;
        if (!activeTrainId) return null;
        const train = s.trains.find((candidate) => candidate.id === activeTrainId);
        if (!train) return null;
        return `${train.id}|${train.lat.toFixed(5)}|${train.lng.toFixed(5)}`;
    });
    const activeTrainPosition = useMemo(
        () => parseTrainPositionSignature(activeTrainPositionSignature),
        [activeTrainPositionSignature],
    );
    const storeDwellingTrainsByStation = useTrainStore((s) => s.stationDwellTrainsByStation);
    const dwellingTrainsByStation = transitMode === 'bus' ? EMPTY_DWELLING_MAP : storeDwellingTrainsByStation;

    const stationMarkers = useMemo(() => filteredStations.map((station) => {
        const dwellingTrains = dwellingTrainsByStation.get(station.id) ?? EMPTY_DWELLING_TRAINS;

        return (
            <Marker
                key={station.id}
                position={[station.latitude, station.longitude]}
                icon={createStationIcon(
                    station,
                    selectedStation?.id === station.id,
                    shouldShowPill(station),
                    prevPillsRef.current.has(station.id),
                    collapsingId === station.id,
                    expandingId === station.id,
                    dwellingTrains
                )}
                eventHandlers={{
                    click: () => {
                        // Toggle Logic
                        setSelectedStation(prev => prev?.id === station.id ? null : station);
                        // In Spectator Mode: also notify train store for SpectatorInfoCard
                        const trainStore = useTrainStore.getState();
                        if (transitMode === 'train' && trainStore.spectatorMode) {
                            const isDeselecting = selectedStation?.id === station.id;
                            trainStore.selectStation(isDeselecting ? null : station.id);
                        }
                    },
                }}
            >
            </Marker>
        );
    }), [filteredStations, selectedStation?.id, collapsingId, expandingId, dwellingTrainsByStation, createStationIcon, shouldShowPill, transitMode, setSelectedStation]);

    // Don't render map until Leaflet is ready (prevents SSR/window issues)
    if (!LeafletData) return <div className="w-full h-full bg-zinc-900 animate-pulse" />;

    return (
        <div className={clsx(
            "relative w-full h-full bg-zinc-900 overflow-hidden",
            isDarkMode ? "tt-map-theme-dark" : "tt-map-theme-light",
            className,
        )}>
            <MapContainer
                center={[14.6091, 121.0223]}
                zoom={12}
                preferCanvas={true}
                dragging={true}
                touchZoom={true}
                doubleClickZoom={true}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%", zIndex: 0 }}
                zoomControl={false}
                attributionControl={true}
            >
                <style>{STATION_MARKER_ANIMATION_STYLES}</style>

                {/* Dynamic Style for Dark Mode Filter (Midnight Blue Tint) */}
                {isDarkMode && (
                    <style>{`
                        .map-tiles-dark-blue {
                            filter: sepia(50%) hue-rotate(180deg) saturate(300%) brightness(90%) contrast(1.1) !important;
                        }
                    `}</style>
                )}

                <TileLayer
                    key={isDarkMode ? 'dark' : 'light'}
                    className={isDarkMode ? 'map-tiles-dark-blue' : ''}
                    url={buildCartoBasemapUrl(
                        isDarkMode ? 'dark' : 'voyager',
                        useLowBandwidthTiles,
                    )}
                    attribution={CARTO_BASEMAP_ATTRIBUTION}
                    updateWhenIdle={true}
                    updateWhenZooming={false}
                    keepBuffer={useLowBandwidthTiles ? 1 : 2}
                />

                <MapCameraFollower
                    activeTrainPosition={activeTrainPosition}
                    selectedStation={selectedStation}
                    filteredStations={filteredStations}
                />
                <MapResizer />
                <MapClickHandler onDeselect={() => {
                    setSelectedStation(null);
                    // Also deselect train/station in spectator mode
                    useTrainStore.getState().selectTrain(null);
                    useTrainStore.getState().selectStation(null);
                }} />

                {/* Draw Lines */}
                <RailLinesLayer operationalMode={operationalMode} line7Mode={line7Mode} transitMode={transitMode} />

                {/* Draw Stations */}
                {stationMarkers}

                {/* Live Train Markers */}
                {transitMode === 'train' && <LiveTrainLayer />}
            </MapContainer>
        </div>
    );
}

export default memo(MapExplorer);
