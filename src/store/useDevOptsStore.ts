import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';

type TripStoreState = ReturnType<typeof useTripStore.getState>;
type TrainStoreState = ReturnType<typeof useTrainStore.getState>;

function toDevOptsStoreView(trip: TripStoreState, train: TrainStoreState) {
    return {
        isDevMode: trip.isDevMode,
        toggleDevMode: trip.toggleDevMode,
        enableDevMode: trip.enableDevMode,
        line7Mode: trip.line7Mode,
        setLine7Mode: trip.setLine7Mode,
        maintenanceMode: trip.maintenanceMode,
        setMaintenanceMode: trip.setMaintenanceMode,
        isGpsOverride: trip.isGpsOverride,
        setGpsOverride: trip.setGpsOverride,
        simulatedLocation: trip.simulatedLocation,
        simulatedHeading: trip.simulatedHeading,
        simulatedSpeed: trip.simulatedSpeed,
        setSimulatedLocation: trip.setSimulatedLocation,
        setSimulatedHeading: trip.setSimulatedHeading,
        setSimulatedSpeed: trip.setSimulatedSpeed,
        mockTrainsMode: train.mockTrainsMode,
        setMockTrainsMode: train.setMockTrainsMode,
        timeFactor: train.timeFactor,
        setTimeFactor: train.setTimeFactor,
    };
}

export type DevOptsStoreView = ReturnType<typeof toDevOptsStoreView>;

export function useDevOptsStore<T>(selector: (state: DevOptsStoreView) => T): T {
    const tripSlice = useTripStore((trip) => trip);
    const trainSlice = useTrainStore((train) => train);
    return selector(toDevOptsStoreView(tripSlice, trainSlice));
}

export const devOptsStoreApi = {
    getState: () => toDevOptsStoreView(useTripStore.getState(), useTrainStore.getState()),
};
