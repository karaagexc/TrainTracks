/**
 * Script to add CONCESSION fares to the existing fare matrix.
 * 
 * Reads the official 50% student discount fare matrices from the DOTr:
 * - MRT-3: 13 stations (M3-01 to M3-13) 
 * - LRT-1: 20 stations (L1-20 to L1-25, then L1-01 to L1-19 — check order)
 * - LRT-2: 13 stations (L2-01 to L2-13)
 * 
 * The concession fares are NOT simply BEEP×0.50.
 * They are pre-determined values from official DOTr fare matrices.
 */

const fs = require('fs');
const path = require('path');

// ====== MRT-3 CONCESSION FARES (from official DOTr MRT-3 50% Student Fare Matrix) ======
// Station order: North Avenue, Quezon Avenue, GMA-Kamuning, Araneta-Cubao, Santolan,
// Ortigas, Shaw Boulevard, Boni, Guadalupe, Buendia, Ayala, Magallanes, Taft Avenue
// IDs: M3-01 through M3-13
const MRT3_CONCESSION = [
    //       M3-01 M3-02 M3-03 M3-04 M3-05 M3-06 M3-07 M3-08 M3-09 M3-10 M3-11 M3-12 M3-13
    /*M3-01*/[0, 6, 6, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14],
    /*M3-02*/[6, 0, 6, 6, 8, 8, 10, 10, 10, 12, 12, 12, 14],
    /*M3-03*/[6, 6, 0, 6, 6, 8, 8, 8, 10, 10, 10, 12, 12],
    /*M3-04*/[8, 6, 6, 0, 6, 6, 6, 8, 8, 10, 10, 10, 12],
    /*M3-05*/[8, 8, 6, 6, 0, 6, 6, 6, 8, 8, 10, 10, 12],
    /*M3-06*/[10, 8, 8, 6, 6, 0, 6, 6, 8, 8, 10, 10, 10],
    /*M3-07*/[10, 10, 8, 6, 6, 6, 0, 6, 6, 8, 8, 8, 10],
    /*M3-08*/[10, 10, 8, 8, 6, 6, 6, 0, 6, 6, 8, 8, 10],
    /*M3-09*/[12, 10, 10, 8, 8, 8, 6, 6, 0, 6, 6, 8, 8],
    /*M3-10*/[12, 12, 10, 10, 8, 8, 8, 6, 6, 0, 6, 6, 8],
    /*M3-11*/[12, 12, 10, 10, 10, 10, 8, 8, 6, 6, 0, 6, 6],
    /*M3-12*/[14, 12, 12, 10, 10, 10, 8, 8, 8, 6, 6, 0, 6],
    /*M3-13*/[14, 14, 12, 12, 12, 10, 10, 10, 8, 8, 6, 6, 0],
];

// ====== LRT-1 CONCESSION FARES (from official LRMC 50% Student Fare Matrix) ======
// Station order per image: Dr. Santos, Ninoy Aquino Ave, PITX, MIA Road, Redemptorist-Aseana,
// Baclaran, EDSA, Libertad, Gil Puyat, Vito Cruz, Quirino, Pedro Gil, UN Avenue,
// Central, Carriedo, D. Jose, Bambang, Tayuman, Blumentritt, Abad Santos, R.Papa,
// 5th Avenue, Monumento, Balintawak, Fernando Poe Jr.
// IDs: L1-20, L1-19, L1-18, L1-17, L1-16, L1-15, L1-14, L1-13, L1-12, L1-11,
//       L1-10, L1-09, L1-08, L1-07, L1-06, L1-05, L1-04, L1-03, L1-02, L1-01,
//       L1-21, L1-22, L1-23, L1-24, L1-25
const LRT1_IDS = [
    'L1-20', 'L1-19', 'L1-18', 'L1-17', 'L1-16', 'L1-15', 'L1-14', 'L1-13',
    'L1-12', 'L1-11', 'L1-10', 'L1-09', 'L1-08', 'L1-07', 'L1-06', 'L1-05',
    'L1-04', 'L1-03', 'L1-02', 'L1-01', 'L1-21', 'L1-22', 'L1-23', 'L1-24', 'L1-25'
];

const LRT1_CONCESSION = [
    // Dr.Santos (L1-20)
    [0, 10, 10, 13, 13, 15, 15, 15, 18, 18, 18, 18, 18, 18, 20, 20, 20, 20, 23, 23, 23, 23, 25, 25, 28],
    // Ninoy Aquino Ave (L1-19)
    [10, 0, 10, 10, 13, 13, 13, 15, 15, 15, 15, 15, 18, 18, 20, 20, 20, 20, 20, 20, 20, 23, 23, 23, 25],
    // PITX (L1-18)
    [10, 10, 0, 10, 10, 13, 13, 13, 15, 15, 15, 15, 15, 18, 18, 18, 20, 20, 20, 20, 20, 20, 23, 23, 25],
    // MIA Road (L1-17)
    [13, 10, 10, 0, 10, 10, 10, 13, 13, 15, 15, 15, 15, 18, 18, 18, 18, 18, 20, 20, 20, 20, 20, 23, 25],
    // Redemptorist-Aseana (L1-16)
    [13, 13, 10, 10, 0, 10, 10, 13, 13, 13, 15, 15, 15, 15, 18, 18, 18, 18, 18, 20, 20, 20, 20, 20, 23],
    // Baclaran (L1-15)
    [15, 13, 13, 10, 10, 0, 10, 10, 10, 13, 13, 13, 13, 15, 15, 15, 18, 18, 18, 20, 18, 20, 20, 20, 23],
    // EDSA (L1-14)
    [15, 13, 13, 10, 10, 10, 0, 10, 10, 10, 13, 13, 13, 13, 15, 15, 15, 18, 18, 20, 18, 20, 20, 20, 23],
    // Libertad (L1-13)
    [15, 15, 13, 13, 13, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 15, 18, 18, 18, 18, 20, 20, 23],
    // Gil Puyat (L1-12)
    [18, 15, 15, 13, 13, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 15, 18, 18, 18, 18, 20, 20],
    // Vito Cruz (L1-11)
    [18, 15, 15, 15, 13, 13, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 15, 15, 18, 18, 20, 20],
    // Quirino (L1-10)
    [18, 15, 15, 15, 15, 13, 13, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 15, 15, 18, 18, 20],
    // Pedro Gil (L1-09)
    [18, 15, 15, 15, 15, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 15, 18, 18, 20],
    // UN Avenue (L1-08)
    [18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 18, 18, 18],
    // Central (L1-07)
    [18, 18, 18, 18, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 18, 18],
    // Carriedo (L1-06)
    [20, 20, 18, 18, 18, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15, 18],
    // D. Jose (L1-05)
    [20, 20, 18, 18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 13, 15, 15],
    // Bambang (L1-04)
    [20, 20, 20, 18, 18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 15, 15],
    // Tayuman (L1-03)
    [20, 20, 20, 18, 18, 18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 10, 13, 13, 15],
    // Blumentritt (L1-02)
    [23, 20, 20, 20, 18, 18, 18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 13, 13, 15],
    // Abad Santos (L1-01)
    [23, 20, 20, 20, 20, 20, 20, 18, 18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 10, 13, 13],
    // R.Papa (L1-21)
    [23, 20, 20, 20, 20, 18, 18, 18, 18, 15, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 13, 13],
    // 5th Avenue (L1-22)
    [23, 23, 20, 20, 20, 20, 20, 18, 18, 18, 15, 15, 15, 15, 13, 13, 13, 10, 10, 10, 10, 0, 10, 10, 13],
    // Monumento (L1-23)
    [25, 23, 23, 20, 20, 20, 20, 20, 18, 18, 18, 18, 18, 15, 15, 13, 13, 13, 13, 10, 10, 10, 0, 10, 10],
    // Balintawak (L1-24)
    [25, 23, 23, 23, 20, 20, 20, 20, 20, 20, 18, 18, 18, 18, 15, 15, 15, 13, 13, 13, 13, 10, 10, 0, 10],
    // Fernando Poe Jr (L1-25)
    [28, 25, 25, 25, 23, 23, 23, 23, 20, 20, 20, 20, 18, 18, 18, 15, 15, 15, 15, 13, 13, 13, 10, 10, 0],
];

// ====== LRT-2 CONCESSION FARES (from official LRTA 50% Student Fare Matrix) ======
// Station order: Recto, Legarda, Pureza, V.Mapa, J.Ruiz, Gilmore,
// Betty Go-Belmonte, Araneta Center-Cubao, Anonas, Katipunan, Santolan,
// Marikina-Pasig, Antipolo
// IDs: L2-01 through L2-13
const LRT2_CONCESSION = [
    //       L2-01 L2-02 L2-03 L2-04 L2-05 L2-06 L2-07 L2-08 L2-09 L2-10 L2-11 L2-12 L2-13
    /*L2-01*/[0, 8, 10, 10, 10, 13, 13, 13, 13, 15, 15, 18, 18],
    /*L2-02*/[8, 0, 8, 10, 10, 10, 13, 13, 13, 13, 15, 15, 18],
    /*L2-03*/[10, 8, 0, 8, 10, 10, 10, 10, 13, 13, 13, 15, 15],
    /*L2-04*/[10, 10, 8, 0, 8, 10, 10, 10, 10, 13, 13, 15, 15],
    /*L2-05*/[10, 10, 10, 8, 0, 8, 10, 10, 10, 10, 13, 13, 15],
    /*L2-06*/[13, 10, 10, 10, 8, 0, 8, 10, 10, 10, 13, 13, 13],
    /*L2-07*/[13, 13, 10, 10, 10, 8, 0, 8, 10, 10, 10, 13, 13],
    /*L2-08*/[13, 13, 10, 10, 10, 10, 8, 0, 8, 10, 10, 10, 13],
    /*L2-09*/[13, 13, 13, 10, 10, 10, 10, 8, 0, 8, 10, 10, 13],
    /*L2-10*/[15, 13, 13, 13, 10, 10, 10, 10, 8, 0, 8, 10, 10],
    /*L2-11*/[15, 15, 13, 13, 13, 13, 10, 10, 10, 8, 0, 8, 10],
    /*L2-12*/[18, 15, 15, 15, 13, 13, 13, 10, 10, 10, 8, 0, 10],
    /*L2-13*/[18, 18, 15, 15, 15, 13, 13, 13, 13, 10, 10, 10, 0],
];

// ====== MAIN: Read fareMatrix.ts and add CONCESSION field to each entry ======

const fareMatrixPath = path.join(__dirname, '..', 'src', 'data', 'fareMatrix.ts');
let content = fs.readFileSync(fareMatrixPath, 'utf-8');

// Build lookup: concessionFares[fromId][toId] = concessionPrice
const concessionFares = {};

// MRT-3
const MRT3_IDS = ['M3-01', 'M3-02', 'M3-03', 'M3-04', 'M3-05', 'M3-06', 'M3-07', 'M3-08', 'M3-09', 'M3-10', 'M3-11', 'M3-12', 'M3-13'];
for (let i = 0; i < MRT3_IDS.length; i++) {
    concessionFares[MRT3_IDS[i]] = {};
    for (let j = 0; j < MRT3_IDS.length; j++) {
        if (i !== j) {
            concessionFares[MRT3_IDS[i]][MRT3_IDS[j]] = MRT3_CONCESSION[i][j];
        }
    }
}

// LRT-1
for (let i = 0; i < LRT1_IDS.length; i++) {
    concessionFares[LRT1_IDS[i]] = concessionFares[LRT1_IDS[i]] || {};
    for (let j = 0; j < LRT1_IDS.length; j++) {
        if (i !== j) {
            concessionFares[LRT1_IDS[i]][LRT1_IDS[j]] = LRT1_CONCESSION[i][j];
        }
    }
}

// LRT-2
const LRT2_IDS = ['L2-01', 'L2-02', 'L2-03', 'L2-04', 'L2-05', 'L2-06', 'L2-07', 'L2-08', 'L2-09', 'L2-10', 'L2-11', 'L2-12', 'L2-13'];
for (let i = 0; i < LRT2_IDS.length; i++) {
    concessionFares[LRT2_IDS[i]] = concessionFares[LRT2_IDS[i]] || {};
    for (let j = 0; j < LRT2_IDS.length; j++) {
        if (i !== j) {
            concessionFares[LRT2_IDS[i]][LRT2_IDS[j]] = LRT2_CONCESSION[i][j];
        }
    }
}

// Now modify the TypeScript fare matrix
// Change the type from Record<string, Record<string, { SJT: number, BEEP: number }>>
// to Record<string, Record<string, { SJT: number, BEEP: number, CONCESSION: number }>>

// Update the type declaration
content = content.replace(
    'Record<string, Record<string, { SJT: number, BEEP: number }>>',
    'Record<string, Record<string, { SJT: number, BEEP: number, CONCESSION: number }>>'
);

// For each fare entry, add the CONCESSION field
// Pattern: "BEEP": <number>\n    }
// Replace with: "BEEP": <number>,\n      "CONCESSION": <number>\n    }

// We'll parse and rebuild
const matrixMatch = content.match(/export const FARE_MATRIX.*= \{([\s\S]*)\};/);
if (!matrixMatch) {
    console.error("Could not find FARE_MATRIX in file");
    process.exit(1);
}

// Actually, let's do a simpler approach: parse the existing matrix, add CONCESSION, write it back
// Use eval to parse (since it's valid JS object syntax)

// Extract just the object part
const objStart = content.indexOf('{', content.indexOf('FARE_MATRIX'));
let braceCount = 0;
let objEnd = -1;
for (let i = objStart; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') braceCount--;
    if (braceCount === 0) {
        objEnd = i + 1;
        break;
    }
}

const objStr = content.substring(objStart, objEnd);
// Use Function constructor (safer than eval)
const matrix = new Function('return ' + objStr)();

// Add CONCESSION to each entry
let missingCount = 0;
for (const [fromId, destinations] of Object.entries(matrix)) {
    for (const [toId, fareData] of Object.entries(destinations)) {
        if (concessionFares[fromId] && concessionFares[fromId][toId] !== undefined) {
            fareData.CONCESSION = concessionFares[fromId][toId];
        } else {
            // Fallback: use Math.round(BEEP * 0.50) if not in official matrix
            fareData.CONCESSION = Math.round(fareData.BEEP * 0.50);
            missingCount++;
            console.warn(`Missing official concession fare for ${fromId} -> ${toId}, using fallback: ${fareData.CONCESSION}`);
        }
    }
}

console.log(`\nTotal entries with fallback: ${missingCount}`);

// Generate new TypeScript content
let output = `// Auto-generated by scripts/add_concession_fares.js based on official DOTr/LRMC/LRTA fare matrices.
// Do not edit manually.

export const FARE_MATRIX: Record<string, Record<string, { SJT: number, BEEP: number, CONCESSION: number }>> = {\n`;

for (const [fromId, destinations] of Object.entries(matrix)) {
    output += `  "${fromId}": {\n`;
    const destEntries = Object.entries(destinations);
    for (let i = 0; i < destEntries.length; i++) {
        const [toId, fareData] = destEntries[i];
        output += `    "${toId}": {\n`;
        output += `      "SJT": ${fareData.SJT},\n`;
        output += `      "BEEP": ${fareData.BEEP},\n`;
        output += `      "CONCESSION": ${fareData.CONCESSION}\n`;
        output += `    }${i < destEntries.length - 1 ? ',' : ''}\n`;
    }
    output += `  },\n`;
}

output += `};\n`;

fs.writeFileSync(fareMatrixPath, output);
console.log('✅ fareMatrix.ts updated with CONCESSION fares!');
