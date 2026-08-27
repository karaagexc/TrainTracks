import { LineId } from "@/types";

export function getStationBadge(lineId: LineId, order: number): string {
    let prefix = 'GL'; // Default LRT-1 (Green Line)
    if (lineId === 'LRT2') prefix = 'PL'; // Purple Line
    if (lineId === 'MRT3') prefix = 'YL'; // Yellow Line
    if (lineId === 'MRT7') prefix = 'ML'; // MRT-7 (Maroon Line)
    if (lineId === 'EDSA') prefix = 'EC'; // EDSA Carousel

    // Format order to 2 digits (e.g., 1 -> 01)
    const num = order.toString().padStart(2, '0');
    return `${prefix}${num}`;
}

export function getLineColor(lineId: LineId): string {
    if (lineId === 'LRT1') return 'bg-lrt1'; // Green
    if (lineId === 'LRT2') return 'bg-lrt2'; // Purple
    if (lineId === 'MRT3') return 'bg-mrt3'; // Yellow
    if (lineId === 'MRT7') return 'bg-mrt7'; // Maroon
    if (lineId === 'EDSA') return 'bg-[#8b7355]'; // EDSA Carousel
    return 'bg-zinc-500';
}


export function getLineColorText(lineId: LineId): string {
    if (lineId === 'LRT1') return 'text-lrt1';
    if (lineId === 'LRT2') return 'text-lrt2';
    if (lineId === 'MRT3') return 'text-mrt3';
    if (lineId === 'MRT7') return 'text-mrt7';
    if (lineId === 'EDSA') return 'text-[#8b7355]';
    return 'text-zinc-500';
}

export const getThemeColors = (lineId: string | undefined) => {
    switch (lineId) {
        case 'LRT1':
            return {
                bg: 'bg-green-600',
                bgGradient: 'bg-green-950/80',
                // Glass: 500-weight (richer), 20% opacity. Added brightness & inner shadow.
                glass: 'bg-emerald-600/60 backdrop-blur-3xl backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]',
                border: 'border-green-500/30 border-t-white/20', // Subtle colored border + White top highlight
                borderLight: 'border-green-400/20',
                text: 'text-green-400',
                textDark: 'text-green-500',
                icon: 'text-green-400',
                fill: 'fill-green-400',
                shadow: 'shadow-[0_8px_32px_rgba(34,197,94,0.25)]', // Softer, more realistic shadow
                accent: 'bg-green-500',
                lightAccent: 'bg-green-500/10',
            };
        case 'LRT2':
            return {
                bg: 'bg-purple-600',
                bgGradient: 'bg-purple-950/80',
                glass: 'bg-purple-600/60 backdrop-blur-3xl backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]',
                border: 'border-purple-500/30 border-t-white/20',
                borderLight: 'border-purple-400/20',
                text: 'text-purple-400',
                textDark: 'text-purple-500',
                icon: 'text-purple-400',
                fill: 'fill-purple-400',
                shadow: 'shadow-[0_8px_32px_rgba(168,85,247,0.25)]',
                accent: 'bg-purple-500',
                lightAccent: 'bg-purple-500/10',
            };
        case 'MRT3':
            return {
                bg: 'bg-yellow-600',
                bgGradient: 'bg-yellow-950/80',
                glass: 'bg-amber-500/60 backdrop-blur-3xl backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]',
                border: 'border-yellow-500/30 border-t-white/20',
                borderLight: 'border-yellow-400/20',
                text: 'text-yellow-400',
                textDark: 'text-yellow-600',
                icon: 'text-yellow-400',
                fill: 'fill-yellow-400',
                shadow: 'shadow-[0_8px_32px_rgba(234,179,8,0.25)]',
                accent: 'bg-yellow-500',
                lightAccent: 'bg-yellow-500/10',
            };
        case 'MRT7':
            return {
                bg: 'bg-mrt7',
                bgGradient: 'bg-[#2b0000]/90',
                glass: 'bg-[#660000]/60 backdrop-blur-3xl backdrop-brightness-50 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]',
                border: 'border-[#a83a3a]/30 border-t-white/20',
                borderLight: 'border-[#c45b5b]/20',
                text: 'text-[#d46a6a]',
                textDark: 'text-mrt7',
                icon: 'text-[#d46a6a]',
                fill: 'fill-[#d46a6a]',
                shadow: 'shadow-[0_8px_32px_rgba(128,0,0,0.35)]',
                accent: 'bg-mrt7',
                lightAccent: 'bg-mrt7/10',
            };
        case 'EDSA':
            return {
                bg: 'bg-[#8b7355]',
                bgGradient: 'bg-[#171512]/95',
                glass: 'bg-[#171512]/95 backdrop-blur-3xl backdrop-saturate-150 shadow-[inset_0_0_20px_rgba(241,228,209,0.08)]',
                border: 'border-[#c2aa86]/35 border-t-[#f1e4d1]/35',
                borderLight: 'border-[#c2aa86]/30',
                text: 'text-[#f1e4d1]',
                textDark: 'text-[#c2aa86]',
                icon: 'text-[#f1e4d1]',
                fill: 'fill-[#f1e4d1]',
                shadow: 'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
                accent: 'bg-[#8b7355]',
                lightAccent: 'bg-[#8b7355]/20',
            };
        default:
            return {
                bg: 'bg-zinc-600',
                bgGradient: 'bg-zinc-900/80',
                glass: 'bg-zinc-900/80', // Default stays dark
                border: 'border-white/10',
                borderLight: 'border-white/5',
                text: 'text-white',
                textDark: 'text-zinc-500',
                icon: 'text-white',
                fill: 'fill-white',
                shadow: 'shadow-none',
                accent: 'bg-zinc-700',
                lightAccent: 'bg-white/5',
            };
    }
};

export function getTransferTarget(stationName: string): string | null {
    const pairs: Record<string, string> = {
        'Doroteo Jose': 'Recto',
        'Recto': 'Doroteo Jose',
        'EDSA': 'Taft Avenue',
        'Taft Avenue': 'EDSA',
        'Araneta - Cubao': 'Araneta - Cubao', // Same name
        'North Avenue': 'North Avenue', // Common Station (Future)
    };

    return pairs[stationName] || null;
}

export function getDoorSide(stationName: string, lineId: string): 'LEFT' | 'RIGHT' | 'EITHER' {
    // MRT-3 Exceptions
    if (lineId === 'MRT3') {
        if (stationName === 'Taft Avenue') return 'EITHER';
        if (['Shaw Boulevard', 'Boni', 'Buendia'].includes(stationName)) return 'LEFT';
    }
    // LRT-2 Exceptions
    else if (lineId === 'LRT2') {
        if (stationName === 'Santolan') return 'LEFT';
    }
    return 'RIGHT';
}
