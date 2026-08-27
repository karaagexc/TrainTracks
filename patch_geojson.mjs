import fs from 'fs';
import path from 'path';

const commonStationCoord = [121.030974133, 14.65531459];

function appendToNorthernEnd(filePath, isLrt1) {
    if (!fs.existsSync(filePath)) {
        console.error("Not found:", filePath);
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Find the feature with the northernmost coordinate in the MultiLineString / LineString
    data.features.forEach(feature => {
        if (feature.geometry.type === 'MultiLineString') {
            // Find the segment that is furthest North (highest latitude [1])
            let northernmostSegment = null;
            let maxLat = -90;
            let isFirstPoint = false;

            feature.geometry.coordinates.forEach(segment => {
                const firstLat = segment[0][1];
                const lastLat = segment[segment.length - 1][1];
                
                if (firstLat > maxLat) {
                    maxLat = firstLat;
                    northernmostSegment = segment;
                    isFirstPoint = true;
                }
                if (lastLat > maxLat) {
                    maxLat = lastLat;
                    northernmostSegment = segment;
                    isFirstPoint = false;
                }
            });

            if (northernmostSegment) {
                // If the northernmost point is the first point, unshift, else push
                if (isFirstPoint) {
                    northernmostSegment.unshift(commonStationCoord);
                } else {
                    northernmostSegment.push(commonStationCoord);
                }
            }
        }
    });

    fs.writeFileSync(filePath, JSON.stringify(data));
    console.log("Patched", filePath);
}

// Ensure mrt7.json exists
fs.copyFileSync('C:/Users/Exelec/Downloads/TrainTracks/line7.txt', 'C:/Users/Exelec/Downloads/TrainTracks/src/data/mrt7.json');
console.log("Copied line7.txt to mrt7.json");

appendToNorthernEnd('C:/Users/Exelec/Downloads/TrainTracks/src/data/lrt1.json', true);
appendToNorthernEnd('C:/Users/Exelec/Downloads/TrainTracks/src/data/mrt3.json', false);
