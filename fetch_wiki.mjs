import fs from 'fs';

const stations = [
    // A subset to test
    "Roosevelt LRT station", "Balintawak LRT station", "Monumento LRT station", "5th Avenue LRT station", "R. Papa LRT station",
    "Abad Santos LRT station", "Blumentritt LRT station", "Tayuman LRT station", "Bambang LRT station", "Doroteo Jose LRT station",
    "Carriedo LRT station", "Central Terminal LRT station", "United Nations LRT station", "Pedro Gil LRT station", "Quirino LRT station",
    "Vito Cruz LRT station", "Gil Puyat LRT station", "Libertad LRT station", "EDSA LRT station", "Baclaran LRT station",
    "Redemptorist LRT station", "MIA LRT station", "PITX LRT station", "Ninoy Aquino LRT station", "Dr. Santos LRT station",
    "Recto LRT station", "Legarda LRT station", "Pureza LRT station", "V. Mapa LRT station", "J. Ruiz LRT station",
    "Gilmore LRT station", "Betty Go-Belmonte LRT station", "Araneta Center-Cubao LRT station", "Anonas LRT station", "Katipunan LRT station",
    "Santolan LRT station", "Marikina LRT station", "Antipolo LRT station",
    "North Avenue MRT station", "Quezon Avenue MRT station", "GMA-Kamuning MRT station", "Santolan-Annapolis MRT station",
    "Ortigas MRT station", "Shaw Boulevard MRT station", "Boni MRT station", "Guadalupe MRT station", "Buendia MRT station",
    "Ayala MRT station", "Magallanes MRT station", "Taft Avenue MRT station"
];

async function fetchWiki(title) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(title)}&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1') return "NOT FOUND";
        return pages[pageId].extract.substring(0, 1000);
    } catch (e) {
        return "ERROR";
    }
}

async function main() {
    console.log("Fetching Wikipedia summaries with redirects...");
    const results = [];
    for (const station of stations) {
        let extract = await fetchWiki(station);
        if (extract === "NOT FOUND") {
            // Try without "LRT station" or "MRT station"
            const shorterTitle = station.replace(/ (LRT|MRT) station/i, ' station');
            extract = await fetchWiki(shorterTitle);
        }
        results.push(`Station: ${station}\nExtract: ${extract}\n---`);
        await new Promise(r => setTimeout(r, 100)); // Be nice to API
    }
    
    fs.writeFileSync('C:/Users/Exelec/Downloads/TrainTracks/wiki_results.txt', results.join('\n'));
    console.log("Done! Saved to wiki_results.txt");
}

main();
