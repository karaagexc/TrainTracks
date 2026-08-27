import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';

type TripStoreState = ReturnType<typeof useTripStore.getState>;
type TrainStoreState = ReturnType<typeof useTrainStore.getState>;

function toPreferencesStoreView(trip: TripStoreState, train: TrainStoreState) {
    return {
        isDarkMode: trip.isDarkMode,
        darkModeOverride: trip.darkModeOverride,
        toggleDarkMode: trip.toggleDarkMode,
        setDarkMode: trip.setDarkMode,
        showRushHour: trip.showRushHour,
        toggleShowRushHour: trip.toggleShowRushHour,
        isMuted: trip.isMuted,
        setIsMuted: trip.setIsMuted,
        notificationPreference: trip.notificationPreference,
        setNotificationPreference: trip.setNotificationPreference,
        crowdConsent: train.crowdConsent,
        setCrowdConsent: train.setCrowdConsent,
    };
}

export type PreferencesStoreView = ReturnType<typeof toPreferencesStoreView>;

export function usePreferencesStore<T>(selector: (state: PreferencesStoreView) => T): T {
    const tripSlice = useTripStore((trip) => trip);
    const trainSlice = useTrainStore((train) => train);
    return selector(toPreferencesStoreView(tripSlice, trainSlice));
}

export const preferencesStoreApi = {
    getState: () => toPreferencesStoreView(useTripStore.getState(), useTrainStore.getState()),
};
