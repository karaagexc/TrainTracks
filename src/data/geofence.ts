export const BRIDGE_ZONES = [
    {
        id: 'L1-L3-BRIDGE',
        name: 'EDSA-Taft Bridge',
        // Simple bounding box or center + radius
        // EDSA: 14.5385, 121.0017
        // Taft: 14.5376, 121.0014
        // Midpoint: 14.53805, 121.00155
        // Radius: ~150m covering the gap
        center: { latitude: 14.53805, longitude: 121.00155 },
        radiusKm: 0.15
    },
    {
        id: 'L1-L2-BRIDGE',
        name: 'DJ-Recto Bridge',
        // DJ: 14.6053, 120.9818
        // Recto: 14.6035, 120.9838
        // Midpoint: 14.6044, 120.9828
        center: { latitude: 14.6044, longitude: 120.9828 },
        radiusKm: 0.2
    },
    {
        id: 'L2-L3-BRIDGE',
        name: 'Cubao Transfer',
        // L2 Cubao: 14.6195, 121.0511
        // M3 Cubao: 14.6195, 121.0511 (Data same? Actually they are walking dist apart in real life but coords might be same in dataset or close)
        // If coords same, bridging is implicit.
        // Let's assume they are same in dataset for now.
        center: { latitude: 14.6195, longitude: 121.0511 },
        radiusKm: 0.1
    }
];
