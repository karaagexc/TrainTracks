import { useTripStore } from '@/store/useTripStore';

type TripStoreState = ReturnType<typeof useTripStore.getState>;

function toJourneyStoreView(state: TripStoreState) {
    return {
        origin: state.origin,
        destination: state.destination,
        ticketType: state.ticketType,
        computedRoute: state.computedRoute,
        routeIndex: state.routeIndex,
        journeySnapshot: state.journeySnapshot,
        currentStation: state.currentStation,
        nextStation: state.nextStation,
        status: state.status,
        direction: state.direction,
        runningFare: state.runningFare,
        tripStartedAt: state.tripStartedAt,
        walkingDistance: state.walkingDistance,
        selectLine: state.selectLine,
        setOrigin: state.setOrigin,
        updateOriginKeepTrip: state.updateOriginKeepTrip,
        setDestination: state.setDestination,
        setTicketType: state.setTicketType,
        startTrip: state.startTrip,
        endTrip: state.endTrip,
        recomputeRoute: state.recomputeRoute,
        advanceToStation: state.advanceToStation,
        syncJourneySnapshot: state.syncJourneySnapshot,
        reset: state.reset,
    };
}

export type JourneyStoreView = ReturnType<typeof toJourneyStoreView>;

export function useJourneyStore<T>(selector: (state: JourneyStoreView) => T): T {
    return useTripStore((state) => selector(toJourneyStoreView(state)));
}

export const journeyStoreApi = {
    getState: () => toJourneyStoreView(useTripStore.getState()),
};
