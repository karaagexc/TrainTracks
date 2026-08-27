import { getCongestionLevel } from './src/data/congestion';

// The user is asking about 12:40 PM PHT on a Friday (Feb 20, 2026)
const testDate = new Date('2026-02-20T12:40:47+08:00');

console.log("=== TRAIN TRACKS CROWD STATUS TEST ===");
console.log(`Time: ${testDate.toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`);
console.log("Day of week:", testDate.getDay(), "(5 = Friday)");

console.log("\n--- Hotspots ---");
const hotspots = ['M3-01', 'M3-04', 'L1-02', 'L1-10', 'L2-01'];
hotspots.forEach(id => {
    const statusNorth = getCongestionLevel(id, testDate, 'NORTH');
    const statusSouth = getCongestionLevel(id, testDate, 'SOUTH');
    console.log(`\nStation: ${id}`);
    console.log(`  NORTHBOUND: Tier=${statusNorth.tier}, Score=${statusNorth.score}, Window=${statusNorth.timeWindow}`);
    console.log(`  SOUTHBOUND: Tier=${statusSouth.tier}, Score=${statusSouth.score}, Window=${statusSouth.timeWindow}`);
});
