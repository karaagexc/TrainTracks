/**
 * Real-world segment distances (meters) and travel times (seconds) between adjacent stations.
 * Source: Official LRTA/DOTr data, Feb 2026.
 *
 * Usage:
 *   getSegmentDistance('L1-01', 'L1-02')  → 600  (Baclaran → EDSA, in meters)
 *   getSegmentTime('L1-01', 'L1-02')     → 120  (Baclaran → EDSA, in seconds)
 *
 * The lookup is direction-agnostic: getSegmentDistance(A, B) === getSegmentDistance(B, A)
 */

export interface SegmentData {
    distanceMeters: number;
    travelTimeSec: number;
}

// Key: sorted pair "id1|id2" (alphabetical) → SegmentData
const SEGMENT_MAP: Record<string, SegmentData> = {};

function addSegment(id1: string, id2: string, distanceMeters: number, travelTimeSec: number) {
    const key = [id1, id2].sort().join('|');
    SEGMENT_MAP[key] = { distanceMeters, travelTimeSec };
}

// ═══════════════════════════════════════
// LRT-1  (South → North order in data)
// Station IDs go L1-25 (Dr. Santos) → L1-20 (FPJ/Roosevelt)
// Cavite Extension: L1-25 (Dr. Santos) → L1-21 (Redemptorist) → L1-01 (Baclaran) → ...
// ═══════════════════════════════════════

// Cavite Extension (South end)
addSegment('L1-25', 'L1-24', 1700, 240);  // Dr. Santos → Ninoy Aquino
addSegment('L1-24', 'L1-23', 1400, 180);  // Ninoy Aquino → Asia World (PITX)
addSegment('L1-23', 'L1-22', 1000, 180);  // Asia World (PITX) → MIA
addSegment('L1-22', 'L1-21', 1300, 180);  // MIA → Redemptorist
addSegment('L1-21', 'L1-01', 800, 180);   // Redemptorist → Baclaran

// Main Line
addSegment('L1-01', 'L1-02', 600, 120);   // Baclaran → EDSA
addSegment('L1-02', 'L1-03', 1000, 120);  // EDSA → Libertad
addSegment('L1-03', 'L1-04', 750, 120);   // Libertad → Gil Puyat
addSegment('L1-04', 'L1-05', 1100, 120);  // Gil Puyat → Vito Cruz
addSegment('L1-05', 'L1-06', 850, 120);   // Vito Cruz → Quirino
addSegment('L1-06', 'L1-07', 800, 120);   // Quirino → Pedro Gil
addSegment('L1-07', 'L1-08', 750, 120);   // Pedro Gil → United Nations
addSegment('L1-08', 'L1-09', 1200, 120);  // United Nations → Central Terminal
addSegment('L1-09', 'L1-10', 700, 120);   // Central Terminal → Carriedo
addSegment('L1-10', 'L1-11', 650, 120);   // Carriedo → Doroteo Jose
addSegment('L1-11', 'L1-12', 650, 120);   // Doroteo Jose → Bambang
addSegment('L1-12', 'L1-13', 600, 120);   // Bambang → Tayuman
addSegment('L1-13', 'L1-14', 650, 120);   // Tayuman → Blumentritt
addSegment('L1-14', 'L1-15', 950, 120);   // Blumentritt → Abad Santos
addSegment('L1-15', 'L1-16', 650, 120);   // Abad Santos → R. Papa
addSegment('L1-16', 'L1-17', 950, 120);   // R. Papa → 5th Avenue
addSegment('L1-17', 'L1-18', 1100, 120);  // 5th Avenue → Monumento
addSegment('L1-18', 'L1-19', 2250, 180);  // Monumento → Balintawak
addSegment('L1-19', 'L1-20', 1870, 180);  // Balintawak → Roosevelt (FPJ)

// ═══════════════════════════════════════
// LRT-2  (West → East: Recto → Antipolo)
// ═══════════════════════════════════════

addSegment('L2-01', 'L2-02', 1050, 120);  // Recto → Legarda
addSegment('L2-02', 'L2-03', 1400, 120);  // Legarda → Pureza
addSegment('L2-03', 'L2-04', 1350, 180);  // Pureza → V. Mapa
addSegment('L2-04', 'L2-05', 1200, 120);  // V. Mapa → J. Ruiz
addSegment('L2-05', 'L2-06', 950, 120);   // J. Ruiz → Gilmore
addSegment('L2-06', 'L2-07', 1050, 120);  // Gilmore → Betty Go-Belmonte
addSegment('L2-07', 'L2-08', 1150, 120);  // Betty Go-Belmonte → Araneta-Cubao
addSegment('L2-08', 'L2-09', 1450, 120);  // Araneta-Cubao → Anonas
addSegment('L2-09', 'L2-10', 950, 120);   // Anonas → Katipunan
addSegment('L2-10', 'L2-11', 1700, 120);  // Katipunan → Santolan  (Note: user data says ~2 min → was listed as ~4min travel for Santolan→Katipunan)
addSegment('L2-11', 'L2-12', 2200, 180);  // Santolan → Marikina-Pasig  (Note: user data for Marikina-Pasig→Santolan ~2min; Santolan→Katipunan ~4min)
addSegment('L2-12', 'L2-13', 2200, 180);  // Marikina-Pasig → Antipolo

// ═══════════════════════════════════════
// MRT-3  (North → South: North Ave → Taft Ave)
// ═══════════════════════════════════════

addSegment('M3-01', 'M3-02', 1200, 120);  // North Avenue → Quezon Avenue
addSegment('M3-02', 'M3-03', 1000, 120);  // Quezon Avenue → GMA-Kamuning
addSegment('M3-03', 'M3-04', 1900, 180);  // GMA-Kamuning → Araneta-Cubao
addSegment('M3-04', 'M3-05', 1500, 180);  // Araneta-Cubao → Santolan-Annapolis
addSegment('M3-05', 'M3-06', 2300, 180);  // Santolan-Annapolis → Ortigas
addSegment('M3-06', 'M3-07', 800, 120);   // Ortigas → Shaw Boulevard
addSegment('M3-07', 'M3-08', 1000, 120);  // Shaw Boulevard → Boni
addSegment('M3-08', 'M3-09', 800, 120);   // Boni → Guadalupe
addSegment('M3-09', 'M3-10', 1900, 180);  // Guadalupe → Buendia
addSegment('M3-10', 'M3-11', 950, 120);   // Buendia → Ayala
addSegment('M3-11', 'M3-12', 1200, 180);  // Ayala → Magallanes
addSegment('M3-12', 'M3-13', 2050, 180);  // Magallanes → Taft Avenue

// ═══════════════════════════════════════
// Public API
// ═══════════════════════════════════════

/**
 * Get real-world segment distance in meters between two adjacent stations.
 * Returns null if the pair isn't in the dataset (not adjacent or unknown).
 */
export function getSegmentDistance(id1: string, id2: string): number | null {
    const key = [id1, id2].sort().join('|');
    return SEGMENT_MAP[key]?.distanceMeters ?? null;
}

/**
 * Get real-world travel time in seconds between two adjacent stations.
 * Returns null if the pair isn't in the dataset.
 */
export function getSegmentTime(id1: string, id2: string): number | null {
    const key = [id1, id2].sort().join('|');
    return SEGMENT_MAP[key]?.travelTimeSec ?? null;
}

/**
 * Get real-world segment distance in kilometers between two adjacent stations.
 * Falls back to null if not found.
 */
export function getSegmentDistanceKm(id1: string, id2: string): number | null {
    const d = getSegmentDistance(id1, id2);
    return d !== null ? d / 1000 : null;
}

/**
 * Get the full segment data for a pair of adjacent stations.
 */
export function getSegmentData(id1: string, id2: string): SegmentData | null {
    const key = [id1, id2].sort().join('|');
    return SEGMENT_MAP[key] ?? null;
}
