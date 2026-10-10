import { create } from 'zustand';
import type { LocationSample, LocationStatus } from '@/types';

interface LocationStore {
    sample: LocationSample | null;
    status: LocationStatus | null;
    setLocationRuntime: (sample: LocationSample | null, status: LocationStatus | null) => void;
    clearLocationRuntime: () => void;
}

export const useLocationStore = create<LocationStore>((set) => ({
    sample: null,
    status: null,
    setLocationRuntime: (sample, status) => set((current) => {
        const sameSample = current.sample?.timestamp === sample?.timestamp
            && current.sample?.source === sample?.source
            && current.sample?.location?.latitude === sample?.location?.latitude
            && current.sample?.location?.longitude === sample?.location?.longitude
            && current.sample?.speedKph === sample?.speedKph
            && current.sample?.rawHeading === sample?.rawHeading
            && current.sample?.accuracyMeters === sample?.accuracyMeters
            && current.sample?.uncertaintyMeters === sample?.uncertaintyMeters
            && current.sample?.confidence === sample?.confidence
            && current.sample?.lastTrustedFixAt === sample?.lastTrustedFixAt;
        const sameStatus = current.status?.code === status?.code
            && current.status?.accuracyMeters === status?.accuracyMeters
            && current.status?.isUsable === status?.isUsable
            && current.status?.isBlocking === status?.isBlocking
            && current.status?.permissionState === status?.permissionState
            && current.status?.title === status?.title
            && current.status?.message === status?.message;
        return sameSample && sameStatus ? current : { sample, status };
    }),
    clearLocationRuntime: () => set({ sample: null, status: null }),
}));
