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
            && current.sample?.source === sample?.source;
        const sameStatus = current.status?.code === status?.code
            && current.status?.accuracyMeters === status?.accuracyMeters
            && current.status?.isUsable === status?.isUsable;
        return sameSample && sameStatus ? current : { sample, status };
    }),
    clearLocationRuntime: () => set({ sample: null, status: null }),
}));
