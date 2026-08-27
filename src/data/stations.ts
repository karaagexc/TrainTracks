import { Station } from "@/types";
import { EDSA_COLOR, EDSA_STOPS } from "@/data/edsaStops";

export const STATIONS: Station[] = [
    // LRT-1 (Green) - North (Roosevelt) to South (Dr. Santos)
    { id: 'L1-20', name: 'Roosevelt (FPJ)', lineId: 'LRT1', order: 1, latitude: 14.657494444, longitude: 121.021211111 },
    { id: 'L1-19', name: 'Balintawak', lineId: 'LRT1', order: 2, latitude: 14.657344444, longitude: 121.003961111 },
    { id: 'L1-18', name: 'Monumento', lineId: 'LRT1', order: 3, latitude: 14.654094444, longitude: 120.983905555 },
    { id: 'L1-17', name: '5th Avenue', lineId: 'LRT1', order: 4, latitude: 14.644416666, longitude: 120.983583333 },
    { id: 'L1-16', name: 'R. Papa', lineId: 'LRT1', order: 5, latitude: 14.636166666, longitude: 120.982333333 },
    { id: 'L1-15', name: 'Abad Santos', lineId: 'LRT1', order: 6, latitude: 14.630641666, longitude: 120.981397222 },
    { id: 'L1-14', name: 'Blumentritt', lineId: 'LRT1', order: 7, latitude: 14.622791666, longitude: 120.982936111 },
    { id: 'L1-13', name: 'Tayuman', lineId: 'LRT1', order: 8, latitude: 14.616794444, longitude: 120.982758333 },
    { id: 'L1-12', name: 'Bambang', lineId: 'LRT1', order: 9, latitude: 14.611111111, longitude: 120.9825 },
    { id: 'L1-11', name: 'Doroteo Jose', lineId: 'LRT1', order: 10, latitude: 14.605475, longitude: 120.982069444, transfers: ['LRT2'] },
    { id: 'L1-10', name: 'Carriedo', lineId: 'LRT1', order: 11, latitude: 14.599, longitude: 120.981358333 },
    { id: 'L1-09', name: 'Central Terminal', lineId: 'LRT1', order: 12, latitude: 14.592902777, longitude: 120.981622222 },
    { id: 'L1-08', name: 'United Nations', lineId: 'LRT1', order: 13, latitude: 14.582491666, longitude: 120.984661111 },
    { id: 'L1-07', name: 'Pedro Gil', lineId: 'LRT1', order: 14, latitude: 14.576630555, longitude: 120.987991666 },
    { id: 'L1-06', name: 'Quirino', lineId: 'LRT1', order: 15, latitude: 14.570219444, longitude: 120.991675 },
    { id: 'L1-05', name: 'Vito Cruz', lineId: 'LRT1', order: 16, latitude: 14.563475, longitude: 120.994680555 },
    { id: 'L1-04', name: 'Gil Puyat', lineId: 'LRT1', order: 17, latitude: 14.554127777, longitude: 120.997177777 },
    { id: 'L1-03', name: 'Libertad', lineId: 'LRT1', order: 18, latitude: 14.547783333, longitude: 120.998630555 },
    { id: 'L1-02', name: 'EDSA', lineId: 'LRT1', order: 19, latitude: 14.538825, longitude: 121.000683333, transfers: ['MRT3'] },
    { id: 'L1-01', name: 'Baclaran', lineId: 'LRT1', order: 20, latitude: 14.534305555, longitude: 120.998361111 },
    // LRT-1 Cavite Extension (Phase 1)
    { id: 'L1-21', name: 'Redemptorist-Aseana', lineId: 'LRT1', order: 21, latitude: 14.53028, longitude: 120.99294 },
    { id: 'L1-22', name: 'MIA', lineId: 'LRT1', order: 22, latitude: 14.51843, longitude: 120.99299 },
    { id: 'L1-23', name: 'PITX (Asia World)', lineId: 'LRT1', order: 23, latitude: 14.50848, longitude: 120.99128 },
    { id: 'L1-24', name: 'Ninoy Aquino', lineId: 'LRT1', order: 24, latitude: 14.49864, longitude: 120.99436 },
    { id: 'L1-25', name: 'Dr. Santos', lineId: 'LRT1', order: 25, latitude: 14.4853, longitude: 120.98956 },

    // LRT-2 (Purple)
    { id: 'L2-01', name: 'Recto', lineId: 'LRT2', order: 1, latitude: 14.603497222, longitude: 120.983402777, transfers: ['LRT1'] },
    { id: 'L2-02', name: 'Legarda', lineId: 'LRT2', order: 2, latitude: 14.60085, longitude: 120.992691666 },
    { id: 'L2-03', name: 'Pureza', lineId: 'LRT2', order: 3, latitude: 14.601666666, longitude: 121.005194444 },
    { id: 'L2-04', name: 'V. Mapa', lineId: 'LRT2', order: 4, latitude: 14.60409, longitude: 121.01712 },
    { id: 'L2-05', name: 'J. Ruiz', lineId: 'LRT2', order: 5, latitude: 14.610555555, longitude: 121.026111111 },
    { id: 'L2-06', name: 'Gilmore', lineId: 'LRT2', order: 6, latitude: 14.613652777, longitude: 121.034347222 },
    { id: 'L2-07', name: 'Betty Go-Belmonte', lineId: 'LRT2', order: 7, latitude: 14.618572222, longitude: 121.042730555 },
    { id: 'L2-08', name: 'Araneta - Cubao', lineId: 'LRT2', order: 8, latitude: 14.622677777, longitude: 121.052636111, transfers: ['MRT3'] },
    { id: 'L2-09', name: 'Anonas', lineId: 'LRT2', order: 9, latitude: 14.628, longitude: 121.064694444 },
    { id: 'L2-10', name: 'Katipunan', lineId: 'LRT2', order: 10, latitude: 14.631097222, longitude: 121.072958333, isUnderground: true },
    { id: 'L2-11', name: 'Santolan', lineId: 'LRT2', order: 11, latitude: 14.622138888, longitude: 121.085916666 },
    { id: 'L2-12', name: 'Marikina', lineId: 'LRT2', order: 12, latitude: 14.6203910, longitude: 121.1003232 },
    { id: 'L2-13', name: 'Antipolo', lineId: 'LRT2', order: 13, latitude: 14.624722222, longitude: 121.121111111 },

    // MRT-3 (Yellow)
    { id: 'M3-01', name: 'North Avenue', lineId: 'MRT3', order: 1, latitude: 14.652444444, longitude: 121.032166666 },
    { id: 'M3-02', name: 'Quezon Avenue', lineId: 'MRT3', order: 2, latitude: 14.642444444, longitude: 121.038673611 },
    { id: 'M3-03', name: 'GMA-Kamuning', lineId: 'MRT3', order: 3, latitude: 14.635144444, longitude: 121.043361111 },
    { id: 'M3-04', name: 'Araneta - Cubao', lineId: 'MRT3', order: 4, latitude: 14.619430555, longitude: 121.051036111, transfers: ['LRT2'] },
    { id: 'M3-05', name: 'Santolan-Annapolis', lineId: 'MRT3', order: 5, latitude: 14.607711111, longitude: 121.056441666 },
    { id: 'M3-06', name: 'Ortigas', lineId: 'MRT3', order: 6, latitude: 14.587938888, longitude: 121.056705555 },
    { id: 'M3-07', name: 'Shaw Boulevard', lineId: 'MRT3', order: 7, latitude: 14.581397222, longitude: 121.053680555 },
    { id: 'M3-08', name: 'Boni', lineId: 'MRT3', order: 8, latitude: 14.573763888, longitude: 121.048166666 },
    { id: 'M3-09', name: 'Guadalupe', lineId: 'MRT3', order: 9, latitude: 14.566861111, longitude: 121.045466666 },
    { id: 'M3-10', name: 'Buendia', lineId: 'MRT3', order: 10, latitude: 14.554202777, longitude: 121.034094444, isUnderground: true },
    { id: 'M3-11', name: 'Ayala', lineId: 'MRT3', order: 11, latitude: 14.548941666, longitude: 121.027672222, isUnderground: true },
    { id: 'M3-12', name: 'Magallanes', lineId: 'MRT3', order: 12, latitude: 14.541786111, longitude: 121.019233333 },
    { id: 'M3-13', name: 'Taft Avenue', lineId: 'MRT3', order: 13, latitude: 14.537516666, longitude: 121.001405555, transfers: ['LRT1'] },

    // MRT-7 (Maroon Line)
    { id: 'M7-01', name: 'Common Station', lineId: 'MRT7', order: 1, latitude: 14.65531459, longitude: 121.030974133, transfers: ['LRT1', 'MRT3'] },
    { id: 'M7-02', name: 'Quezon Memorial', lineId: 'MRT7', order: 2, latitude: 14.6523, longitude: 121.0475, isUnderground: true },
    { id: 'M7-03', name: 'University Avenue', lineId: 'MRT7', order: 3, latitude: 14.65503, longitude: 121.05491 },
    { id: 'M7-04', name: 'Tandang Sora', lineId: 'MRT7', order: 4, latitude: 14.66342, longitude: 121.06742 },
    { id: 'M7-05', name: 'Don Antonio', lineId: 'MRT7', order: 5, latitude: 14.67699, longitude: 121.08263 },
    { id: 'M7-06', name: 'Batasan', lineId: 'MRT7', order: 6, latitude: 14.68508, longitude: 121.08625 },
    { id: 'M7-07', name: 'Manggahan', lineId: 'MRT7', order: 7, latitude: 14.69750, longitude: 121.08722 },
    { id: 'M7-08', name: 'Doña Carmen', lineId: 'MRT7', order: 8, latitude: 14.70510, longitude: 121.07827 },
    { id: 'M7-09', name: 'Regalado', lineId: 'MRT7', order: 9, latitude: 14.70638, longitude: 121.06805 },
    { id: 'M7-10', name: 'Mindanao Avenue', lineId: 'MRT7', order: 10, latitude: 14.73278, longitude: 121.06111 },
    { id: 'M7-11', name: 'Quirino', lineId: 'MRT7', order: 11, latitude: 14.73546, longitude: 121.06692 },
    { id: 'M7-12', name: 'Sacred Heart', lineId: 'MRT7', order: 12, latitude: 14.75388, longitude: 121.08502 },
    { id: 'M7-13', name: 'Tala', lineId: 'MRT7', order: 13, latitude: 14.77000, longitude: 121.07916 },
    { id: 'M7-14', name: 'San Jose del Monte', lineId: 'MRT7', order: 14, latitude: 14.81389, longitude: 121.04528 },
    ...EDSA_STOPS,
];

export const LINES = {
    LRT1: {
        name: 'LRT-1',
        kind: 'rail',
        color: '#22C55E',
        operatingSpeedKph: 60,
        designSpeedKph: 60,
        avgCommercialSpeedKph: 28,   // ~26-30 km/h
        trainCars: 4,                // Gen 4
        trainLengthMeters: 106,
        carLengthMeters: 26.5,
    },
    LRT2: {
        name: 'LRT-2',
        kind: 'rail',
        color: '#a855f7',
        operatingSpeedKph: 60,
        designSpeedKph: 80,
        avgCommercialSpeedKph: 35,   // ~30-40 km/h
        trainCars: 4,
        trainLengthMeters: 94,
        carLengthMeters: 23.5,
    },
    MRT3: {
        name: 'MRT-3',
        kind: 'rail',
        color: '#FACC15',
        operatingSpeedKph: 60,
        designSpeedKph: 65,
        avgCommercialSpeedKph: 30,   // ~30 km/h
        trainCars: 3,               // Standard config (4 cars during rush hour)
        trainLengthMeters: 93.75,   // Standard; 125m with 4 cars
        carLengthMeters: 31.25,
        rushHour: {
            trainCars: 4,
            trainLengthMeters: 125,
        },
    },
    MRT7: {
        name: 'MRT-7',
        kind: 'rail',
        color: '#800000', // maroon
        operatingSpeedKph: 60,
        designSpeedKph: 80,
        avgCommercialSpeedKph: 35,
        trainCars: 3, // Hyundai Rotem
        trainLengthMeters: 65.45,
        carLengthMeters: 21.8,
    },
    EDSA: {
        name: 'EDSA Carousel',
        kind: 'bus',
        color: EDSA_COLOR,
        operatingSpeedKph: 50,
        designSpeedKph: 60,
        avgCommercialSpeedKph: 18,
        trainCars: 1,
        trainLengthMeters: 12,
        carLengthMeters: 12,
    },
};

