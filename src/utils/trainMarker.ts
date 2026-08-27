import type { Direction } from '@/types';

export type DirectionBadgeAnchor = 'top-right' | 'bottom-right';

export interface DirectionBadgePlacement {
    direction: Direction;
    anchor: DirectionBadgeAnchor;
    rotationDegrees: number;
}

const BADGE_PLACEMENTS: Record<Direction, DirectionBadgePlacement> = {
    NORTHBOUND: {
        direction: 'NORTHBOUND',
        anchor: 'top-right',
        rotationDegrees: 0,
    },
    EASTBOUND: {
        direction: 'EASTBOUND',
        anchor: 'bottom-right',
        rotationDegrees: 90,
    },
    SOUTHBOUND: {
        direction: 'SOUTHBOUND',
        anchor: 'bottom-right',
        rotationDegrees: 180,
    },
    WESTBOUND: {
        direction: 'WESTBOUND',
        anchor: 'top-right',
        rotationDegrees: -90,
    },
};

export function getDirectionBadgePlacements(directions: Iterable<Direction>): DirectionBadgePlacement[] {
    const uniqueDirections = new Set(directions);
    return (Object.keys(BADGE_PLACEMENTS) as Direction[])
        .filter((direction) => uniqueDirections.has(direction))
        .map((direction) => BADGE_PLACEMENTS[direction]);
}

export function getDirectionBadgePositionStyle(anchor: DirectionBadgeAnchor): string {
    return anchor === 'top-right'
        ? 'top: -6px; right: -6px;'
        : 'bottom: -6px; right: -6px;';
}
