import { create } from 'zustand';

interface ConnectivityState {
    online: boolean;
    syncing: boolean;
    pendingWrites: number;
    lastSyncedAt: number | null;
    setConnectivity: (patch: Partial<Omit<ConnectivityState, 'setConnectivity'>>) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
    online: true,
    syncing: false,
    pendingWrites: 0,
    lastSyncedAt: null,
    setConnectivity: (patch) => set(patch),
}));
