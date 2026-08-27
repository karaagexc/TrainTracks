'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { useTrainStore } from '@/store/useTrainStore';
import { EDSA_COLOR } from '@/data/edsaStops';
import {
    TrainPresence,
} from '@/types/train';

const LINE_MARKER_COLORS: Record<string, string> = {
    LRT1: '#22c55e',
    LRT2: '#a855f7',
    MRT3: '#eab308',
    MRT7: '#800000',
    EDSA: EDSA_COLOR,
};

function getIconZoomBucket(zoomLevel: number): number {
    return Math.round(zoomLevel * 2) / 2;
}

function isDocumentHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
}

function createTrainIcon(L: any, train: TrainPresence, isMoving: boolean, zoomLevel: number = 14) {
    const color = LINE_MARKER_COLORS[train.lineId] || '#888';
    const isStale = train.freshness === 'stale';
    const isPredicted = train.source === 'predicted';
    const sourceCount = train.sourceCount ?? 1;
    const size = 40;
    const halfSize = size / 2;
    const scale = Math.max(0.45, Math.min(1, 0.55 + (getIconZoomBucket(zoomLevel) - 11) * 0.15));

    const pulseSvg = isMoving && !isStale && !isPredicted
        ? `<svg style="position:absolute;top:-10px;left:-10px;pointer-events:none;" width="${size + 20}" height="${size + 20}">
               <circle cx="${halfSize + 10}" cy="${halfSize + 10}" r="15" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.6">
                   <animate attributeName="r" from="${halfSize - 2}" to="${halfSize + 8}" dur="1.5s" repeatCount="indefinite"/>
                   <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite"/>
               </circle>
           </svg>`
        : '';

    const direction = String(train.direction ?? '').toLowerCase();
    const rotation =
        direction.includes('south') ? 180 :
        direction.includes('east') ? 90 :
        direction.includes('west') ? -90 : 0;

    const imgUrl = `/gps-markers/${String(train.lineId ?? '').toLowerCase()}.png`;
    const strokeFilter = `drop-shadow(1px 1px 0 ${color}) drop-shadow(-1px -1px 0 ${color}) drop-shadow(1px -1px 0 ${color}) drop-shadow(-1px 1px 0 ${color}) drop-shadow(0px 2px 5px rgba(0,0,0,0.6))`;
    const markerOpacity = isPredicted ? 0.5 : isStale ? 0.62 : 1;
    const signalBadge = sourceCount > 1 && !isPredicted
        ? `<div style="position:absolute;bottom:-4px;left:-6px;min-width:18px;height:18px;padding:0 5px;background:rgba(8,47,73,0.92);border-radius:999px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.7);box-shadow:0 1px 4px rgba(0,0,0,0.35);z-index:11;color:white;font-size:9px;font-weight:800;line-height:1;">${sourceCount}</div>`
        : '';

    return L.divIcon({
        className: 'train-marker-icon',
        iconSize: [size, size],
        iconAnchor: [halfSize, halfSize],
        html: `
            <div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;transform:scale(${scale});transform-origin:center center;transition:transform 0.3s ease;opacity:${markerOpacity};filter:${isStale ? 'grayscale(0.45)' : 'none'};">
                ${pulseSvg}
                <img src="${imgUrl}" alt="${train.lineId}" onerror="this.style.display='none'" draggable="false" style="width:100%;height:100%;object-fit:contain;filter:${strokeFilter};z-index:5;position:relative;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;pointer-events:none;" />
                <div style="position:absolute;top:-6px;right:-6px;background:${color};border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:10;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${rotation}deg);">
                        <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                </div>
                ${signalBadge}
            </div>
        `,
    });
}

function getTrainIconSignature(train: TrainPresence, isMoving: boolean, zoomLevel: number): string {
    return [
        train.lineId,
        train.direction,
        train.statusCode,
        train.source,
        train.freshness,
        train.sourceCount ?? 1,
        train.predictionScope ?? '',
        isMoving ? 'moving' : 'still',
        getIconZoomBucket(zoomLevel),
    ].join('|');
}

export function LiveTrainLayer() {
    const map = useMap();
    const trains = useTrainStore((s) => s.trains);
    const selectTrain = useTrainStore((s) => s.selectTrain);

    const markersRef = useRef<Map<string, any>>(new Map());
    const prevPositionsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
    const animFramesRef = useRef<Map<string, number>>(new Map());
    const iconSignaturesRef = useRef<Map<string, string>>(new Map());
    const LRef = useRef<any>(null);

    useEffect(() => {
        import('leaflet').then((L) => {
            LRef.current = L;
        });
    }, []);

    useEffect(() => {
        const L = LRef.current;
        if (!L) return;

        const activeMapTrains = trains.filter((train) => (
            train.statusCode !== 'AT_STATION' &&
            train.predictionScope !== 'station'
        ));
        const currentTrainIds = new Set(activeMapTrains.map((train) => train.id));

        markersRef.current.forEach((marker, trainId) => {
            if (!currentTrainIds.has(trainId)) {
                const frameId = animFramesRef.current.get(trainId);
                if (frameId) cancelAnimationFrame(frameId);
                animFramesRef.current.delete(trainId);
                map.removeLayer(marker);
                markersRef.current.delete(trainId);
                prevPositionsRef.current.delete(trainId);
                iconSignaturesRef.current.delete(trainId);
            }
        });

        activeMapTrains.forEach((train) => {
            const existingMarker = markersRef.current.get(train.id);
            const prevPos = prevPositionsRef.current.get(train.id);

            if (existingMarker && prevPos) {
                const isMoving = prevPos.lat !== train.lat || prevPos.lng !== train.lng;
                const oldFrame = animFramesRef.current.get(train.id);
                if (oldFrame) cancelAnimationFrame(oldFrame);

                if (isMoving && !isDocumentHidden()) {
                    const startLat = prevPos.lat;
                    const startLng = prevPos.lng;
                    const endLat = train.lat;
                    const endLng = train.lng;
                    let startTime: number | null = null;
                    const duration = 800;

                    const animate = (timestamp: number) => {
                        if (!startTime) startTime = timestamp;
                        const elapsed = timestamp - startTime;
                        const t = Math.min(elapsed / duration, 1);
                        const eased = t < 0.5
                            ? 4 * t * t * t
                            : 1 - Math.pow(-2 * t + 2, 3) / 2;

                        const lat = startLat + (endLat - startLat) * eased;
                        const lng = startLng + (endLng - startLng) * eased;
                        existingMarker.setLatLng([lat, lng]);


                        if (t < 1) {
                            animFramesRef.current.set(train.id, requestAnimationFrame(animate));
                        } else {
                            animFramesRef.current.delete(train.id);
                        }
                    };

                    animFramesRef.current.set(train.id, requestAnimationFrame(animate));
                } else if (isMoving) {
                    existingMarker.setLatLng([train.lat, train.lng]);
                }

                const zoomLevel = getIconZoomBucket(map.getZoom());
                const iconSignature = getTrainIconSignature(train, isMoving, zoomLevel);
                if (iconSignaturesRef.current.get(train.id) !== iconSignature) {
                    existingMarker.setIcon(createTrainIcon(L, train, isMoving, zoomLevel));
                    iconSignaturesRef.current.set(train.id, iconSignature);
                }
            } else {
                const zoomLevel = getIconZoomBucket(map.getZoom());
                const marker = L.marker([train.lat, train.lng], {
                    icon: createTrainIcon(L, train, false, zoomLevel),
                    zIndexOffset: train.source === 'predicted' ? -300 : 100,
                }).addTo(map);

                marker.on('click', (e: any) => {
                    e.originalEvent?.stopPropagation();
                    selectTrain(train.id);
                });

                markersRef.current.set(train.id, marker);
                iconSignaturesRef.current.set(train.id, getTrainIconSignature(train, false, zoomLevel));
            }

            prevPositionsRef.current.set(train.id, {
                lat: train.lat,
                lng: train.lng,
            });
        });
    }, [trains, map, selectTrain]);

    useEffect(() => {
        const L = LRef.current;
        if (!L) return;

        const handleZoom = () => {
            const zoomLevel = getIconZoomBucket(map.getZoom());
            markersRef.current.forEach((marker, trainId) => {
                const train = useTrainStore.getState().trains.find((candidate) => candidate.id === trainId);
                if (!train) return;
                const prevPos = prevPositionsRef.current.get(trainId);
                const isMoving = prevPos ? prevPos.lat !== train.lat || prevPos.lng !== train.lng : false;
                const iconSignature = getTrainIconSignature(train, isMoving, zoomLevel);
                if (iconSignaturesRef.current.get(trainId) !== iconSignature) {
                    marker.setIcon(createTrainIcon(L, train, isMoving, zoomLevel));
                    iconSignaturesRef.current.set(trainId, iconSignature);
                }
            });
        };

        map.on('zoomend', handleZoom);
        return () => { map.off('zoomend', handleZoom); };
    }, [map]);

    useEffect(() => {
        const animFrames = animFramesRef.current;
        const markers = markersRef.current;
        const prevPositions = prevPositionsRef.current;
        const iconSignatures = iconSignaturesRef.current;

        return () => {
            animFrames.forEach((frameId) => cancelAnimationFrame(frameId));
            animFrames.clear();
            markers.forEach((marker) => map.removeLayer(marker));
            markers.clear();
            prevPositions.clear();
            iconSignatures.clear();
        };
    }, [map]);

    return null;
}
