import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

const cwd = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request === 'server-only') {
        return path.join(cwd, 'node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js');
    }
    if (request.startsWith('@/')) {
        return originalResolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
};

function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            resolveJsonModule: true,
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;

    module._compile(output, filename);
}

Module._extensions['.ts'] = transpileTypeScript;
Module._extensions['.tsx'] = transpileTypeScript;

const require = Module.createRequire(import.meta.url);
const { STATIONS, LINES } = require('../src/data/stations.ts');
const edsaGeoLine = require('../src/data/edsa_carousel.json');
const {
    calculateEdsaBusFare,
    getEdsaBusFareOptions,
    getEdsaRouteDistanceKm,
} = require('../src/data/fareMatrixBus.ts');
const {
    getLineKind,
    getNetworkStations,
    isBuiltLine,
    isRailLine,
} = require('../src/domain/railway.ts');
const {
    BUS_STOP_BOARDING_RADIUS_KM,
    getStationProximity,
} = require('../src/domain/location/stationProximity.ts');
const { buildJourneyRoute, getJourneyRouteStations } = require('../src/domain/journey/routeBuilder.ts');
const { sanitizeCrowdPresencePayload } = require('../src/domain/crowd/presence.ts');
const { sanitizeStallReportPayload } = require('../src/domain/crowd/stallReport.ts');
const { getSimulationLegProfile, stepSimulationLeg } = require('../src/domain/simulation/engine.ts');

function station(id) {
    const found = STATIONS.find((candidate) => candidate.id === id);
    assert.ok(found, `Missing station ${id}`);
    return found;
}

const edsaStops = STATIONS.filter((candidate) => candidate.lineId === 'EDSA');
assert.equal(edsaStops.length, 25, 'EDSA Carousel exposes direction-aware selectable stops');
edsaStops.forEach((stop) => {
    assert.equal(typeof stop.latitude, 'number', `${stop.id} has latitude`);
    assert.equal(typeof stop.longitude, 'number', `${stop.id} has longitude`);
    assert.ok(stop.stopType, `${stop.id} has stop type metadata`);
    assert.ok(stop.directionAvailability, `${stop.id} has direction availability metadata`);
    assert.ok(stop.coordinateConfidence, `${stop.id} has coordinate confidence metadata`);
    assert.ok(Array.isArray(stop.sourceRefs) && stop.sourceRefs.length > 0, `${stop.id} has source metadata`);
});

assert.equal(LINES.EDSA.color, '#8b7355', 'EDSA line color is the requested brown');
assert.equal(LINES.EDSA.kind, 'bus', 'EDSA is registered as a bus line');
assert.equal(getLineKind('EDSA'), 'bus', 'domain classifies EDSA as bus');
assert.equal(isRailLine('EDSA'), false, 'EDSA is not a rail line');
assert.equal(isBuiltLine('EDSA'), false, 'EDSA is not a built rail line');

const liveRailStations = getNetworkStations('live', 'WITH_NA', 'train');
assert.equal(liveRailStations.some((candidate) => candidate.lineId === 'EDSA'), false, 'train mode excludes EDSA');
assert.equal(liveRailStations.some((candidate) => candidate.lineId === 'MRT7'), false, 'train live mode still excludes MRT-7');

const liveBusStops = getNetworkStations('live', 'OFF', 'bus');
assert.equal(liveBusStops.length, 25, 'bus mode returns the EDSA stop set');
assert.equal(liveBusStops.every((candidate) => candidate.lineId === 'EDSA'), true, 'bus mode is locked to EDSA');
assert.ok(liveBusStops.some((candidate) => candidate.id === 'EC-21' && candidate.name === 'SM Mall of Asia' && candidate.directionAvailability === 'both'), 'MOA is modeled bidirectional');
assert.ok(liveBusStops.some((candidate) => candidate.id === 'EC-22' && candidate.name === 'Redemptorist-DFA' && candidate.directionAvailability === 'both'), 'Redemptorist-DFA is modeled bidirectional');
assert.ok(liveBusStops.some((candidate) => candidate.id === 'EC-23' && candidate.name === 'City of Dreams' && candidate.directionAvailability === 'both'), 'City of Dreams is modeled bidirectional');
assert.ok(liveBusStops.some((candidate) => candidate.id === 'EC-24' && candidate.name === 'Ayala Aseana' && candidate.directionAvailability === 'both'), 'Ayala Aseana is modeled bidirectional');
assert.ok(liveBusStops.some((candidate) => candidate.id === 'EC-18' && candidate.directionAvailability === 'southbound_only'), 'Tramo remains southbound-only');

assert.equal(edsaGeoLine.type, 'FeatureCollection', 'EDSA GeoLine is valid GeoJSON FeatureCollection');
assert.equal(edsaGeoLine.features?.length, 2, 'EDSA GeoLine carries direction-separated busway paths');
edsaGeoLine.features.forEach((feature) => {
    assert.equal(feature.geometry?.type, 'LineString', `${feature.properties?.id} is a corridor LineString`);
    assert.equal(feature.properties?.stroke, '#8b7355', `${feature.properties?.id} carries requested color`);
});
const southboundGeoLine = edsaGeoLine.features.find((feature) => feature.properties?.direction === 'SOUTHBOUND');
const northboundGeoLine = edsaGeoLine.features.find((feature) => feature.properties?.direction === 'NORTHBOUND');
assert.ok(southboundGeoLine, 'EDSA GeoLine includes southbound path');
assert.ok(northboundGeoLine, 'EDSA GeoLine includes northbound path');
assert.ok(southboundGeoLine.geometry.coordinates.length > 50, 'southbound path uses extracted route geometry');
assert.ok(northboundGeoLine.geometry.coordinates.length > 30, 'northbound path uses extracted route geometry');
assert.ok(southboundGeoLine.geometry.coordinates[0][1] > southboundGeoLine.geometry.coordinates.at(-1)[1], 'southbound path runs Monumento to PITX');
assert.ok(northboundGeoLine.geometry.coordinates[0][1] < northboundGeoLine.geometry.coordinates.at(-1)[1], 'northbound path runs PITX to Monumento');

assert.equal(calculateEdsaBusFare(5, 'BUS_REGULAR'), 18, '2026 EDSA fare is PHP 18 through first 5 km');
assert.equal(calculateEdsaBusFare(10, 'BUS_REGULAR'), 32.9, '2026 EDSA fare adds PHP 2.98 per km after 5 km');
assert.equal(calculateEdsaBusFare(25, 'BUS_REGULAR'), 77.6, '2026 EDSA 25 km fare sample matches formula');
assert.equal(calculateEdsaBusFare(10, 'CONCESSION'), 26.32, 'standard EDSA concession fare applies the statutory 20% discount');
assert.deepEqual(
    getEdsaBusFareOptions(10, 'BUS_REGULAR'),
    { standard: 32.9, serviceContracting: 26.32 },
    'participating Service Contracting units expose a separate 20% regular fare',
);
assert.equal(
    calculateEdsaBusFare(10, 'CONCESSION', 'service_contracting'),
    19.74,
    'participating Service Contracting units expose the combined 40% concession discount',
);

const monumento = station('EC-01');
const pitx = station('EC-25');
const tramo = station('EC-18');
const moa = station('EC-21');
const redemptoristDfa = station('EC-22');
const cityOfDreams = station('EC-23');
const ayalaAseana = station('EC-24');
const drSantos = station('L1-25');
const busNearRailTerminus = getStationProximity({
    location: { latitude: drSantos.latitude, longitude: drSantos.longitude },
    mode: 'live',
    line7Mode: 'OFF',
    transitMode: 'bus',
});
assert.equal(busNearRailTerminus.closest?.station.lineId, 'EDSA', 'Bus mode never falls through to Dr. Santos or another rail station');

const atCityOfDreams = getStationProximity({
    location: { latitude: cityOfDreams.latitude, longitude: cityOfDreams.longitude },
    transitMode: 'bus',
});
assert.equal(atCityOfDreams.nearest?.station.id, 'EC-23', 'City of Dreams selects itself at the stop');
assert.equal(atCityOfDreams.conflicts.length, 0, 'City of Dreams does not conflict with Ayala Aseana at the stop');

const atAyalaAseana = getStationProximity({
    location: { latitude: ayalaAseana.latitude, longitude: ayalaAseana.longitude },
    transitMode: 'bus',
});
assert.equal(atAyalaAseana.nearest?.station.id, 'EC-24', 'Ayala Aseana selects itself at the stop');
assert.equal(atAyalaAseana.conflicts.length, 0, 'Ayala Aseana does not conflict with City of Dreams at the stop');

const southEndOverlap = getStationProximity({
    location: {
        latitude: (cityOfDreams.latitude + ayalaAseana.latitude) / 2,
        longitude: (cityOfDreams.longitude + ayalaAseana.longitude) / 2,
    },
    transitMode: 'bus',
});
assert.deepEqual(
    southEndOverlap.conflicts.map((entry) => entry.station.id).sort(),
    ['EC-23', 'EC-24'],
    'COD and Ayala Aseana are both offered only inside their GPS overlap zone',
);
assert.equal(
    southEndOverlap.conflicts.every((entry) => entry.distance <= BUS_STOP_BOARDING_RADIUS_KM),
    true,
    'overlapping Bus choices are within boarding range',
);
assert.ok(getEdsaRouteDistanceKm(monumento, pitx) > 20, 'Monumento to PITX bus distance is corridor-derived');

const southboundRoute = buildJourneyRoute(monumento, pitx, 'live', 'OFF', 'bus');
assert.ok(southboundRoute, 'Monumento to PITX builds a bus route');
assert.equal(southboundRoute?.transitMode, 'bus', 'bus route is tagged bus mode');
assert.equal(southboundRoute?.edges.every((edge) => edge.type === 'rail' ? edge.lineId === 'EDSA' : true), true, 'direct EDSA trip stays on EDSA');

const northboundRoute = buildJourneyRoute(pitx, monumento, 'live', 'OFF', 'bus');
assert.ok(northboundRoute, 'PITX to Monumento builds a bus route');
const northboundStationIds = getJourneyRouteStations(northboundRoute).map((candidate) => candidate.id);
assert.equal(northboundStationIds.includes('EC-18'), false, 'northbound route skips southbound-only Tramo');
assert.deepEqual(
    northboundStationIds.slice(0, 5),
    ['EC-25', 'EC-24', 'EC-23', 'EC-22', 'EC-21'],
    'northbound south-end order is PITX, Ayala Aseana, City of Dreams, Redemptorist-DFA, MOA',
);
const southboundStationIds = getJourneyRouteStations(southboundRoute).map((candidate) => candidate.id);
assert.deepEqual(
    southboundStationIds.slice(-5),
    ['EC-21', 'EC-22', 'EC-23', 'EC-24', 'EC-25'],
    'southbound south-end order is MOA, Redemptorist-DFA, City of Dreams, Ayala Aseana, PITX',
);
assert.equal(southboundStationIds.includes('EC-18'), true, 'southbound route includes Tramo');

const invalidTramoRoute = buildJourneyRoute(pitx, tramo, 'live', 'OFF', 'bus');
assert.equal(invalidTramoRoute, null, 'northbound destination to southbound-only Tramo is rejected');
assert.ok(buildJourneyRoute(pitx, moa, 'live', 'OFF', 'bus'), 'northbound destination to MOA is allowed');
assert.ok(buildJourneyRoute(monumento, cityOfDreams, 'live', 'OFF', 'bus'), 'southbound destination to City of Dreams is allowed');
assert.ok(buildJourneyRoute(pitx, redemptoristDfa, 'live', 'OFF', 'bus'), 'northbound destination to Redemptorist-DFA is allowed');
assert.ok(buildJourneyRoute(monumento, ayalaAseana, 'live', 'OFF', 'bus'), 'southbound destination to Ayala Aseana is allowed');

const busSimLeg = getSimulationLegProfile(monumento, station('EC-02'));
assert.ok(busSimLeg.path?.length > 2, 'bus simulation leg uses extracted GeoLine path');
const busSimStep = stepSimulationLeg(
    { latitude: monumento.latitude, longitude: monumento.longitude },
    busSimLeg,
    5000,
    8,
    0,
);
assert.equal(busSimStep.arrived, false, 'bus simulation advances along the corridor without instantly snapping');
assert.ok(busSimStep.progress > 0, 'bus simulation reports corridor progress');

const edsaCrowd = sanitizeCrowdPresencePayload({
    deviceId: 'device-edsa-test',
    lineId: 'EDSA',
    direction: 'SOUTHBOUND',
    lat: monumento.latitude,
    lng: monumento.longitude,
    speedKph: 20,
    statusCode: 'IN_TRANSIT',
});
assert.equal(edsaCrowd.ok, false, 'crowd train presence rejects EDSA');
assert.equal(edsaCrowd.code, 'invalid_line');

const edsaStall = sanitizeStallReportPayload({
    deviceId: 'device-edsa-test',
    lineId: 'EDSA',
    lat: monumento.latitude,
    lng: monumento.longitude,
    severity: 'confirmed_traffic',
});
assert.equal(edsaStall.ok, false, 'stall reports reject EDSA');
assert.equal(edsaStall.code, 'invalid_line');

console.log('Bus mode smoke checks passed.');
