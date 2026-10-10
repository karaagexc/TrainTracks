import { create } from 'zustand';
import { CrowdPresenceConsent } from '@/types';
import { TrainPresence } from '@/types/train';
import type { PredictedTrain } from '@/domain/predictions/engine';
import type { PredictionConnectionState, PredictionSnapshot } from '@/domain/predictions/snapshot';
import { API_CONFIG_DEFAULTS, type ApiConfig, type ConfigLoadResult } from '@/domain/config';
import {
    buildStationDwellSnapshot,
    clusterTrainPresence,
    filterOverriddenPredictions,
    getTrainPresenceIdentity,
    isTrainPresenceExpired,
} from '@/domain/trainPresence';

const CROWD_CONSENT_KEY = 'traintracks_crowd_presence_consent';

interface TrainStore {
    trains: TrainPresence[];
    rawTrains: TrainPresence[];
    stationDwellSignature: string;
    stationDwellTrainsByStation: Map<string, TrainPresence[]>;
    spectatorMode: boolean;
    selectedTrainId: string | null;
    selectedStationCode: string | null;
    followedTrainId: string | null;
    lastPollTimestamp: number;
    isPolling: boolean;
    error: string | null;
    predictionSnapshots: PredictionSnapshot[];
    predictionContext: number;
    predictionRevision: number;
    predictionState: PredictionConnectionState;
    predictionError: string | null;
    predictionLastReceivedAt: number;
    stationForecasts: TrainPresence[];
    offlineForecasts: PredictedTrain[];
    realtimeStatus: string;
    realtimeError: string | null;
    crowdSnapshotReceivedAt: number;
    apiConfig: ApiConfig;
    runtimeConfigState: ConfigLoadResult['status'] | 'loading';
    runtimeConfigError: string | null;
    setRuntimeApiConfig: (result: ConfigLoadResult) => void;
    mockTrainsMode: boolean;
    timeFactor: number;
    isBroadcasting: boolean;
    crowdTrain: TrainPresence | null;
    selfTrainPresence: TrainPresence | null;
    crowdConsent: CrowdPresenceConsent;
    setTrains: (trains: TrainPresence[]) => void;
    setPredictedTrains: (trains: TrainPresence[]) => void;
    beginPredictionContext: () => number;
    setPredictionSnapshots: (context: number, snapshots: PredictionSnapshot[]) => void;
    setPredictionState: (state: PredictionConnectionState, error?: string | null) => void;
    setOfflineForecasts: (context: number, forecasts: PredictedTrain[], revision: number) => void;
    setRealtimeStatus: (status: string, error?: string | null) => void;
    reconcileCrowdSnapshot: (trains: TrainPresence[], receivedAt: number) => void;
    upsertTrain: (train: TrainPresence) => void;
    pruneStaleTrains: () => void;
    toggleSpectatorMode: () => void;
    setSpectatorMode: (enabled: boolean) => void;
    selectTrain: (id: string | null) => void;
    selectStation: (code: string | null) => void;
    followTrain: (id: string | null) => void;
    setPolling: (polling: boolean) => void;
    setError: (error: string | null) => void;
    setBroadcasting: (broadcasting: boolean) => void;
    setCrowdTrain: (train: TrainPresence | null) => void;
    setSelfTrainPresence: (train: TrainPresence | null) => void;
    setCrowdConsent: (consent: CrowdPresenceConsent) => void;
    setMockTrainsMode: (val: boolean) => void;
    setTimeFactor: (val: number) => void;
}

function getInitialCrowdConsent(): CrowdPresenceConsent {
    if (typeof window === 'undefined') return 'unknown';
    try {
        const stored = window.localStorage.getItem(CROWD_CONSENT_KEY);
        return stored === 'granted' || stored === 'denied' ? stored : 'unknown';
    } catch { return 'unknown'; }
}

function buildPresenceState(
    rawTrains: TrainPresence[],
    previousDwellSnapshot?: Pick<TrainStore, 'stationDwellSignature' | 'stationDwellTrainsByStation'>,
    now = Date.now(),
): Pick<TrainStore, 'rawTrains' | 'trains' | 'stationDwellSignature' | 'stationDwellTrainsByStation'> {
    const activeRaw = filterOverriddenPredictions(
        rawTrains.filter((train) => !isTrainPresenceExpired(train, now)),
        now,
    );
    const trains = clusterTrainPresence(activeRaw.filter((train) => train.predictionScope !== 'station'), now);
    const dwellSnapshot = buildStationDwellSnapshot(trains, now);
    const shouldReusePreviousDwell = previousDwellSnapshot?.stationDwellSignature === dwellSnapshot.signature;

    return {
        rawTrains: activeRaw,
        trains,
        stationDwellSignature: dwellSnapshot.signature,
        stationDwellTrainsByStation: shouldReusePreviousDwell
            ? previousDwellSnapshot.stationDwellTrainsByStation
            : dwellSnapshot.byStation,
    };
}

function mergeRawTrainList(existing: TrainPresence[], incoming: TrainPresence[], protectedTrains: Array<TrainPresence | null>): TrainPresence[] {
    const now = Date.now();
    const next = new Map<string, TrainPresence>();

    const upsertNewest = (train: TrainPresence) => {
        const identity = getTrainPresenceIdentity(train);
        const current = next.get(identity);
        if (current?.sampleId && train.sampleId === current.sampleId) return;
        if (!current || train.updatedAt >= current.updatedAt) {
            next.set(identity, train);
        }
    };

    existing
        .filter((train) => !isTrainPresenceExpired(train, now))
        .forEach(upsertNewest);

    incoming.forEach(upsertNewest);

    protectedTrains
        .filter((train): train is TrainPresence => !!train && !isTrainPresenceExpired(train, now))
        .forEach(upsertNewest);

    return Array.from(next.values())
        .sort((left, right) => left.id.localeCompare(right.id));
}

function protectedTrainIdentities(state: Pick<TrainStore, 'crowdTrain' | 'selfTrainPresence'>): Set<string> {
    return new Set(
        [state.crowdTrain, state.selfTrainPresence]
            .filter((train): train is TrainPresence => !!train)
            .map(getTrainPresenceIdentity),
    );
}
export const useTrainStore = create<TrainStore>((set, get) => ({
    trains: [],
    rawTrains: [],
    stationDwellSignature: '',
    stationDwellTrainsByStation: new Map(),
    spectatorMode: false,
    selectedTrainId: null,
    selectedStationCode: null,
    followedTrainId: null,
    lastPollTimestamp: 0,
    isPolling: false,
    error: null,
    predictionSnapshots: [],
    predictionContext: 0,
    predictionRevision: 0,
    predictionState: 'idle',
    predictionError: null,
    predictionLastReceivedAt: 0,
    stationForecasts: [],
    offlineForecasts: [],
    realtimeStatus: 'idle',
    realtimeError: null,
    crowdSnapshotReceivedAt: 0,
    apiConfig: structuredClone(API_CONFIG_DEFAULTS),
    runtimeConfigState: 'loading',
    runtimeConfigError: null,
    setRuntimeApiConfig: (result) => set((state) => ({
        apiConfig: result.config?.api_config ?? state.apiConfig,
        runtimeConfigState: result.status,
        runtimeConfigError: result.error,
    })),
    mockTrainsMode: false,
    timeFactor: 1,
    isBroadcasting: false,
    crowdTrain: null,
    selfTrainPresence: null,
    crowdConsent: getInitialCrowdConsent(),

    setTrains: (incoming) => set((state) => {
        const protectedIdentities = protectedTrainIdentities(state);
        const retainedCrowd = state.rawTrains.filter((train) => (
            train.source === 'crowd' && !protectedIdentities.has(getTrainPresenceIdentity(train))
        ));
        const rawTrains = mergeRawTrainList(retainedCrowd, incoming, [state.crowdTrain, state.selfTrainPresence]);
        return {
            ...buildPresenceState(rawTrains, state),
            lastPollTimestamp: Date.now(),
            error: null,
        };
    }),

    setPredictedTrains: (incoming) => set((state) => {
        const withoutPreviousPredictions = state.rawTrains.filter((train) => train.source !== 'predicted');
        const rawTrains = mergeRawTrainList(withoutPreviousPredictions, incoming, [state.crowdTrain, state.selfTrainPresence]);
        return {
            ...buildPresenceState(rawTrains, state),
            stationForecasts: incoming.filter((train) => train.predictionScope === 'station'),
        };
    }),

    beginPredictionContext: () => {
        const context = get().predictionContext + 1;
        set((state) => ({
            predictionContext: context,
            predictionRevision: 0,
            predictionSnapshots: [],
            stationForecasts: [],
            offlineForecasts: [],
            predictionLastReceivedAt: 0,
            predictionState: 'idle',
            predictionError: null,
            ...buildPresenceState(state.rawTrains.filter((train) => train.source !== 'predicted'), state),
        }));
        return context;
    },

    setPredictionSnapshots: (context, incoming) => set((state) => {
        if (context !== state.predictionContext) return state;
        const snapshots = new Map(state.predictionSnapshots.map((snapshot) => [snapshot.key, snapshot]));
        let accepted = false;
        for (const snapshot of incoming) {
            const previous = snapshots.get(snapshot.key);
            if (previous && Date.parse(snapshot.response.generatedAt) < Date.parse(previous.response.generatedAt)) continue;
            snapshots.set(snapshot.key, snapshot);
            accepted = true;
        }
        if (!accepted) return state;
        const predictionSnapshots = Array.from(snapshots.values());
        const predictions = predictionSnapshots.flatMap((snapshot) => snapshot.response.predictions);
        const rawTrains = mergeRawTrainList(state.rawTrains.filter((train) => train.source !== 'predicted'),
            predictions, [state.crowdTrain, state.selfTrainPresence]);
        const receivedAt = Math.max(...predictionSnapshots.map((snapshot) => snapshot.receivedAt));
        const fresh = predictionSnapshots.every((snapshot) => Date.parse(snapshot.response.validUntil) >= Date.now());
        return {
            ...buildPresenceState(rawTrains, state),
            predictionSnapshots,
            predictionRevision: state.predictionRevision + 1,
            stationForecasts: predictions.filter((train) => train.predictionScope === 'station'),
            offlineForecasts: [],
            predictionState: fresh ? 'fresh' : 'stale',
            predictionError: null,
            predictionLastReceivedAt: receivedAt,
            lastPollTimestamp: receivedAt,
        };
    }),
    setPredictionState: (predictionState, predictionError = null) => set({ predictionState, predictionError }),
    setOfflineForecasts: (context, offlineForecasts, revision) => set((state) => context === state.predictionContext
        && revision === state.predictionRevision
        && state.predictionState !== 'fresh' ? { offlineForecasts, stationForecasts: offlineForecasts } : state),
    setRealtimeStatus: (realtimeStatus, realtimeError = null) => set({ realtimeStatus, realtimeError }),
    reconcileCrowdSnapshot: (incoming, receivedAt) => set((state) => {
        if (receivedAt < state.crowdSnapshotReceivedAt) return state;
        const rawTrains = mergeRawTrainList(state.rawTrains, incoming, [state.crowdTrain, state.selfTrainPresence]);
        return { ...buildPresenceState(rawTrains, state), crowdSnapshotReceivedAt: receivedAt };
    }),

    upsertTrain: (train) => set((state) => {
        const previous = state.rawTrains.find((candidate) => getTrainPresenceIdentity(candidate) === getTrainPresenceIdentity(train));
        if (previous && (train.updatedAt < previous.updatedAt || (train.sampleId && train.sampleId === previous.sampleId))) return state;
        const rawTrains = mergeRawTrainList(state.rawTrains, [train], [state.crowdTrain, state.selfTrainPresence]);
        return {
            ...buildPresenceState(rawTrains, state),
        };
    }),

    pruneStaleTrains: () => set((state) => buildPresenceState(state.rawTrains, state)),

    toggleSpectatorMode: () => set((state) => {
        const next = !state.spectatorMode;
        return {
            spectatorMode: next,
            ...(next ? {} : {
                selectedTrainId: null,
                selectedStationCode: null,
                followedTrainId: null,
            }),
        };
    }),

    setSpectatorMode: (enabled) => set({
        spectatorMode: enabled,
        ...(enabled ? {} : {
            selectedTrainId: null,
            selectedStationCode: null,
            followedTrainId: null,
        }),
    }),

    selectTrain: (id) => set({
        selectedTrainId: id,
        selectedStationCode: null,
    }),

    selectStation: (code) => set({
        selectedStationCode: code,
        selectedTrainId: null,
    }),

    followTrain: (id) => set({ followedTrainId: id }),
    setPolling: (polling) => set({ isPolling: polling }),
    setError: (error) => set({ error }),
    setBroadcasting: (broadcasting) => set({ isBroadcasting: broadcasting }),

    setCrowdTrain: (train) => set((state) => {
        const previousIdentity = state.crowdTrain
            ? getTrainPresenceIdentity(state.crowdTrain)
            : null;
        const withoutPreviousSelf = previousIdentity
            ? state.rawTrains.filter((candidate) => getTrainPresenceIdentity(candidate) !== previousIdentity)
            : state.rawTrains;
        const rawTrains = mergeRawTrainList(withoutPreviousSelf, train ? [train] : [], [train, state.selfTrainPresence]);

        return {
            crowdTrain: train,
            ...buildPresenceState(rawTrains, state),
        };
    }),
    setSelfTrainPresence: (train) => set((state) => {
        const previousIdentity = state.selfTrainPresence
            ? getTrainPresenceIdentity(state.selfTrainPresence)
            : null;
        const withoutPreviousSelf = previousIdentity
            ? state.rawTrains.filter((candidate) => getTrainPresenceIdentity(candidate) !== previousIdentity)
            : state.rawTrains;
        const rawTrains = mergeRawTrainList(withoutPreviousSelf, train ? [train] : [], [state.crowdTrain, train]);

        return {
            selfTrainPresence: train,
            ...buildPresenceState(rawTrains, state),
        };
    }),
    setCrowdConsent: (consent) => {
        if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(CROWD_CONSENT_KEY, consent); } catch { /* Consent still changes in memory. */ }
        }
        set({ crowdConsent: consent });
    },

    setMockTrainsMode: (val) => set({ mockTrainsMode: val }),
    setTimeFactor: (val) => set({ timeFactor: val }),
}));
