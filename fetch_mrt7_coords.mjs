import fs from 'fs';

const stations = [
    "North Avenue station (MRT)",
    "Quezon Memorial MRT station",
    "University Avenue MRT station",
    "Tandang Sora MRT station",
    "Don Antonio MRT station",
    "Batasan MRT station",
    "Manggahan MRT station",
    "Doña Carmen MRT station",
    "Regalado MRT station",
    "Mindanao Avenue MRT station",
    "Quirino MRT station",
    "Sacred Heart MRT station",
    "Tala MRT station",
    "San Jose del Monte MRT station"
];

async function fetchCoords(title) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&titles=${encodeURIComponent(title)}&format=json&redirects=1`;
        const res = await fetch(url);
        const data = await res.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1' || !pages[pageId].coordinates) return null;
        const coords = pages[pageId].coordinates[0];
        return [coords.lon, coords.lat]; // GeoJSON format
    } catch (e) {
        return null;
    }
}

async function main() {
    console.log("Fetching MRT-7 Station Coordinates...");
    const results = {};
    for (const station of stations) {
        const coords = await fetchCoords(station);
        results[station] = coords;
        console.log(`${station}: ${coords}`);
        await new Promise(r => setTimeout(r, 100)); // Be nice
    }
    
    fs.writeFileSync('C:/Users/Exelec/Downloads/TrainTracks/mrt7_coords.json', JSON.stringify(results, null, 2));
    console.log("Done! Saved to mrt7_coords.json");
}

main();
