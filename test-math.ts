import { STATIONS } from './src/data/stations';
import { getRoute } from './src/utils/simRoute';

const origin = STATIONS.find(s => s.name === 'Magallanes')!;
const dest = STATIONS.find(s => s.name === 'Libertad')!;
const displayStation = STATIONS.find(s => s.name === 'EDSA')!;

let direction = 'SOUTH';
let isSouth = direction === 'SOUTH' || direction === null;

const fullRoute = getRoute(origin, dest);
const rIdx = fullRoute.findIndex(s => s.id === displayStation.id);
if (rIdx >= 0) {
    const prevRouteS = fullRoute[rIdx - 1];
    const nextRouteS = fullRoute[rIdx + 1];

    if (prevRouteS && prevRouteS.lineId === displayStation.lineId) {
        isSouth = prevRouteS.order < displayStation.order;
        console.log("Triggered Prev", isSouth);
    } else if (nextRouteS && nextRouteS.lineId === displayStation.lineId) {
        isSouth = nextRouteS.order > displayStation.order;
        console.log("Triggered Next", isSouth);
    } else {
        console.log("TRIGGERED NEITHER! isSouth remains", isSouth);
    }
} else {
    console.log("rIdx not found!");
}

const lineStations = STATIONS.filter(s => s.lineId === displayStation.lineId).sort((a, b) => a.order - b.order);
const idx = lineStations.findIndex(s => s.id === displayStation.id);

let visNext;
if (isSouth) {
    visNext = lineStations[idx + 1] || null;
} else {
    visNext = lineStations[idx - 1] || null;
}
console.log("VisNext is:", visNext?.name);
