
import { LineId } from "@/types";

export interface TransferDetail {
    fromLine: LineId;
    toLine: LineId;
    stationName: string;
    instruction: string;
    routeDescription?: string; // e.g. "Via Covered Bridge"
    routeType?: 'BRIDGE' | 'MALL' | 'STREET' | 'ELEVATED';
    direction: 'RIGHT' | 'LEFT' | 'STRAIGHT' | 'UP' | 'DOWN';
    walkTimeMin: number; // Real walking time in minutes
    distanceMeters: number;
    targetCoordinates?: {
        latitude: number;
        longitude: number;
    };
}

export const TRANSFER_DATA: TransferDetail[] = [
    // === EDSA / TAFT (LRT1 <-> MRT3) ===
    {
        fromLine: 'LRT1',
        toLine: 'MRT3',
        stationName: 'EDSA',
        instruction: 'Cross the connecting footbridge to MRT-3 Taft Ave.',
        routeDescription: 'Via Metropoint Mall / Bridge',
        routeType: 'MALL',
        direction: 'RIGHT',
        walkTimeMin: 4, // Range 3-5
        distanceMeters: 165,
        targetCoordinates: { latitude: 14.537516666, longitude: 121.001405555 }
    },
    {
        fromLine: 'MRT3',
        toLine: 'LRT1',
        stationName: 'Taft Avenue',
        instruction: 'Exit station and take bridge/mall to LRT-1 EDSA.',
        routeDescription: 'Via Metropoint Mall / Bridge',
        routeType: 'MALL',
        direction: 'LEFT',
        walkTimeMin: 4, // Range 3-5
        distanceMeters: 165,
        targetCoordinates: { latitude: 14.538825, longitude: 121.000683333 }
    },

    // === D. JOSE / RECTO (LRT1 <-> LRT2) ===
    {
        fromLine: 'LRT1',
        toLine: 'LRT2',
        stationName: 'Doroteo Jose',
        instruction: 'Walk along the elevated connector to Recto Station.',
        routeDescription: 'Via Covered Bridge',
        routeType: 'BRIDGE',
        direction: 'STRAIGHT',
        walkTimeMin: 5, // Range 4-6
        distanceMeters: 320,
        targetCoordinates: { latitude: 14.6035, longitude: 120.9838 }
    },
    {
        fromLine: 'LRT2',
        toLine: 'LRT1',
        stationName: 'Recto',
        instruction: 'Take the elevated walkway to Doroteo Jose.',
        routeDescription: 'Via Covered Bridge',
        routeType: 'BRIDGE',
        direction: 'STRAIGHT',
        walkTimeMin: 5, // Range 4-6
        distanceMeters: 320,
        targetCoordinates: { latitude: 14.6053, longitude: 120.9818 }
    },

    // === ARANETA-CUBAO (LRT2 <-> MRT3) ===
    {
        fromLine: 'LRT2',
        toLine: 'MRT3',
        stationName: 'Araneta - Cubao',
        instruction: 'Exit to Gateway Mall, walk through to Farmers Plaza.',
        routeDescription: 'Via Gateway/Farmers Mall',
        routeType: 'MALL',
        direction: 'STRAIGHT',
        walkTimeMin: 12, // Range 10-15
        distanceMeters: 750,
        targetCoordinates: { latitude: 14.6194, longitude: 121.0510 }
    },
    {
        fromLine: 'MRT3',
        toLine: 'LRT2',
        stationName: 'Araneta - Cubao',
        instruction: 'Walk through Farmers Plaza and Gateway Mall to LRT-2.',
        routeDescription: 'Via Farmers/Gateway Mall',
        routeType: 'MALL',
        direction: 'STRAIGHT',
        walkTimeMin: 12, // Range 10-15
        distanceMeters: 750,
        targetCoordinates: { latitude: 14.6227, longitude: 121.0526 }
    },
    {
        fromLine: 'LRT1',
        toLine: 'MRT7',
        stationName: 'Roosevelt',
        instruction: 'Follow the Common Station connector toward MRT-7 platforms.',
        routeDescription: 'Via Unified Grand Central Station',
        routeType: 'ELEVATED',
        direction: 'STRAIGHT',
        walkTimeMin: 5,
        distanceMeters: 350,
        targetCoordinates: { latitude: 14.6553, longitude: 121.0310 }
    },
    {
        fromLine: 'MRT7',
        toLine: 'LRT1',
        stationName: 'Common Station',
        instruction: 'Use the Common Station connector toward LRT-1 Roosevelt (FPJ).',
        routeDescription: 'Via Unified Grand Central Station',
        routeType: 'ELEVATED',
        direction: 'STRAIGHT',
        walkTimeMin: 5,
        distanceMeters: 350,
        targetCoordinates: { latitude: 14.6575, longitude: 121.0212 }
    },
    {
        fromLine: 'MRT3',
        toLine: 'MRT7',
        stationName: 'North Avenue',
        instruction: 'Walk north through the Common Station connector to MRT-7.',
        routeDescription: 'Via Unified Grand Central Station',
        routeType: 'ELEVATED',
        direction: 'STRAIGHT',
        walkTimeMin: 4,
        distanceMeters: 280,
        targetCoordinates: { latitude: 14.6553, longitude: 121.0310 }
    },
    {
        fromLine: 'MRT7',
        toLine: 'MRT3',
        stationName: 'Common Station',
        instruction: 'Use the connector toward MRT-3 North Avenue platforms.',
        routeDescription: 'Via Unified Grand Central Station',
        routeType: 'ELEVATED',
        direction: 'STRAIGHT',
        walkTimeMin: 4,
        distanceMeters: 280,
        targetCoordinates: { latitude: 14.6523, longitude: 121.0323 }
    },


];

export function getTransferDetails(fromLine: LineId, toLine: LineId, currentStationName: string): TransferDetail | null {
    // Try to find exact match
    const found = TRANSFER_DATA.find(t =>
        t.fromLine === fromLine &&
        t.toLine === toLine &&
        (t.stationName === currentStationName || currentStationName.includes(t.stationName))
    );

    if (found) return found;

    return {
        // Fallback Generic
        fromLine,
        toLine,
        stationName: currentStationName,
        instruction: `Transfer to ${toLine} Line`,
        routeDescription: 'Follow Signs',
        routeType: 'STREET',
        direction: 'STRAIGHT',
        walkTimeMin: 5,
        distanceMeters: 200
    };
}
