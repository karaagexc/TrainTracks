export type CartoBasemapStyle = 'dark' | 'voyager';

export const CARTO_BASEMAP_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function buildCartoBasemapUrl(
    style: CartoBasemapStyle,
    useLowBandwidthTiles: boolean,
): string {
    const scale = useLowBandwidthTiles ? '' : '{r}';
    return `/api/map-tiles/${style}/{z}/{x}/{y}${scale}.png`;
}
