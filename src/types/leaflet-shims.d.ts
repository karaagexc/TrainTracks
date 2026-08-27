declare module "leaflet" {
    const L: any;
    export = L;
}

declare module "react-leaflet" {
    import * as React from "react";

    export const MapContainer: React.ComponentType<any>;
    export const Marker: React.ComponentType<any>;
    export const Polyline: React.ComponentType<any>;
    export const TileLayer: React.ComponentType<any>;

    export function useMap(): any;
    export function useMapEvents(events: Record<string, (...args: any[]) => void>): any;
}
