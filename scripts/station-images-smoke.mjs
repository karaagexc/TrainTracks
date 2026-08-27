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
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            resolveJsonModule: true,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;

    module._compile(output, filename);
}

Module._extensions['.ts'] = transpileTypeScript;
Module._extensions['.tsx'] = transpileTypeScript;

const require = Module.createRequire(import.meta.url);
const { STATIONS } = require('../src/data/stations.ts');
const { STATION_INFO } = require('../src/data/stationInfo.ts');
const imageSources = require('../src/data/stationImageSources.json');

const liveStations = STATIONS.filter((station) => station.lineId !== 'MRT7' && station.lineId !== 'EDSA');
const manifestByPath = new Map(imageSources.map((item) => [item.localPath, item]));

assert.equal(liveStations.length, 51, 'live station image smoke count should cover LRT-1, LRT-2, and MRT-3');

for (const station of liveStations) {
    const info = STATION_INFO[station.id];
    assert.ok(info, `missing STATION_INFO for ${station.id}`);
    assert.ok(Array.isArray(info.images), `${station.id} images must be an array`);
    assert.ok(info.images.length > 0, `${station.id} must have at least one station image`);

    for (const imagePath of info.images) {
        assert.match(imagePath, /^\/station-images\/.+\.webp$/, `${station.id} should use a local WebP image`);
        const absolutePath = path.join(cwd, 'public', imagePath);
        assert.ok(fs.existsSync(absolutePath), `${station.id} local image is missing: ${imagePath}`);
        assert.ok(fs.statSync(absolutePath).size > 1024, `${station.id} local image is unexpectedly tiny: ${imagePath}`);

        const manifestEntry = manifestByPath.get(imagePath);
        assert.ok(manifestEntry, `${station.id} image should have source metadata: ${imagePath}`);
        assert.equal(manifestEntry.stationId, station.id, `${station.id} source manifest station id should match`);
        assert.equal(manifestEntry.scope, 'live', `${station.id} source manifest should mark live scope`);
        assert.match(manifestEntry.sourceUrl, /^https:\/\/upload\.wikimedia\.org\//, `${station.id} should have a Wikimedia source URL`);
        assert.match(manifestEntry.sourcePage, /^https:\/\/en\.wikipedia\.org\//, `${station.id} should have a recheckable source page`);
        assert.equal(manifestEntry.checkedAt, '2026-05-31', `${station.id} source checked date should be current for this repair pass`);
    }
}

const caviteExtensionImages = ['L1-21', 'L1-22', 'L1-23', 'L1-24', 'L1-25']
    .map((stationId) => STATION_INFO[stationId]?.images?.[0]);
assert.equal(new Set(caviteExtensionImages).size, caviteExtensionImages.length, 'Cavite Extension stations must not reuse one shared image');

console.log('Station image smoke checks passed');
