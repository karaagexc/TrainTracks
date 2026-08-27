"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from '@/lib/supabase/client';
import {
    Terminal, Key, Play, Settings, Activity, Copy, Check, Trash2,
    Plus, RefreshCw, ChevronDown, LogOut, ExternalLink, Pause,
    Download, Radio, BookOpen, Power, AlertTriangle, X,
    Clock, Shield,
} from "lucide-react";
import { ApiDocs } from "@/components/ApiDocs";
import { ApiConfirmModal } from "@/components/ApiConfirmModal";
import { PREDICTION_MAP_LIMIT } from "@/domain/predictions/clientRequests";
import type { RailLineId } from "@/types";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface LineStats {
    lineId: RailLineId;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    trainCount: number;
    directions: Record<string, number>;
    serviceState: string;
    dayType: string;
    sourceVersion: string;
    loading: boolean;
    error: string | null;
}

interface ApiToken {
    id: string;
    name: string;
    tokenPreview: string;
    createdAt: string;
    scopes: string[];
    isActive: boolean;
}

interface ApiTokenRecord {
    id: string;
    name: string;
    token_prefix: string;
    scopes: string[] | null;
    is_active?: boolean;
    created_at: string;
}

interface CliLogEntry {
    timestamp: string;
    lrt1: number;
    lrt2: number;
    mrt3: number;
    serviceState: string;
    raw?: object;
}

interface PlaygroundState {
    lineId: string;
    direction: string;
    stationId: string;
    scope: string;
    limit: string;
    response: string | null;
    loading: boolean;
    url: string;
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LINE_CONFIG: { id: RailLineId; label: string; color: string; bgColor: string; borderColor: string; directions: string[] }[] = [
    { id: 'LRT1', label: 'LRT-1', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', directions: ['SOUTHBOUND', 'NORTHBOUND'] },
    { id: 'LRT2', label: 'LRT-2', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20', directions: ['EASTBOUND', 'WESTBOUND'] },
    { id: 'MRT3', label: 'MRT-3', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20', directions: ['SOUTHBOUND', 'NORTHBOUND'] },
];

const DIRECTION_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'NORTHBOUND', label: 'Northbound' },
    { value: 'SOUTHBOUND', label: 'Southbound' },
    { value: 'EASTBOUND', label: 'Eastbound' },
    { value: 'WESTBOUND', label: 'Westbound' },
];

const SERVICE_STATE_COLORS: Record<string, string> = {
    active: 'text-emerald-400 bg-emerald-500/10',
    service_closed: 'text-zinc-500 bg-zinc-800',
    not_yet_started: 'text-amber-400 bg-amber-500/10',
    last_train_passed: 'text-zinc-500 bg-zinc-800',
    service_suspended: 'text-red-400 bg-red-500/10',
    unavailable: 'text-zinc-600 bg-zinc-900',
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function mapApiToken(record: ApiTokenRecord): ApiToken {
    return {
        id: record.id,
        name: record.name,
        tokenPreview: `${record.token_prefix}...`,
        createdAt: record.created_at,
        scopes: record.scopes ?? [],
        isActive: record.is_active !== false,
    };
}
function formatTimestamp(): string {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
        </button>
    );
}

// â”€â”€â”€ Section Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2.5 mb-4">
            <Icon className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-300">{title}</h2>
            {badge}
        </div>
    );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <div>
            <div className={`text-xl font-black tabular-nums ${color || 'text-white'}`}>{value}</div>
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-0.5">{label}</div>
            {sub && <div className="text-[9px] text-zinc-600 mt-0.5">{sub}</div>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//  MAIN CONSOLE
// ═══════════════════════════════════════════════════════════

export function ApiConsole({ userEmail }: { userEmail: string | null }) {
    // â”€â”€â”€ Tab State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [activeTab, setActiveTab] = useState<'stats' | 'tokens' | 'playground' | 'cli' | 'config' | 'docs'>('stats');

    // â”€â”€â”€ Live Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [lineStats, setLineStats] = useState<LineStats[]>(
        LINE_CONFIG.map((cfg) => ({
            lineId: cfg.id,
            label: cfg.label,
            color: cfg.color,
            bgColor: cfg.bgColor,
            borderColor: cfg.borderColor,
            trainCount: 0,
            directions: {},
            serviceState: 'loading',
            dayType: '',
            sourceVersion: '',
            loading: true,
            error: null,
        }))
    );

    const fetchLineStats = useCallback(async () => {
        const updated = await Promise.all(
            LINE_CONFIG.map(async (cfg) => {
                try {
                    const res = await fetch(`/api/predictions?scope=map&lineId=${cfg.id}&limit=${PREDICTION_MAP_LIMIT}`);
                    const data = await res.json();
                    const directions: Record<string, number> = {};
                    (data.predictions ?? []).forEach((p: { direction: string }) => {
                        directions[p.direction] = (directions[p.direction] || 0) + 1;
                    });
                    return {
                        lineId: cfg.id,
                        label: cfg.label,
                        color: cfg.color,
                        bgColor: cfg.bgColor,
                        borderColor: cfg.borderColor,
                        trainCount: data.predictions?.length ?? 0,
                        directions,
                        serviceState: data.serviceState ?? 'unknown',
                        dayType: data.dayType ?? '',
                        sourceVersion: data.sourceVersion ?? '',
                        loading: false,
                        error: null,
                    };
                } catch {
                    return {
                        lineId: cfg.id,
                        label: cfg.label,
                        color: cfg.color,
                        bgColor: cfg.bgColor,
                        borderColor: cfg.borderColor,
                        trainCount: 0,
                        directions: {},
                        serviceState: 'error',
                        dayType: '',
                        sourceVersion: '',
                        loading: false,
                        error: 'Failed to fetch',
                    };
                }
            })
        );
        setLineStats(updated);
    }, []);

    useEffect(() => {
        fetchLineStats();
        const interval = setInterval(fetchLineStats, 10_000);
        return () => clearInterval(interval);
    }, [fetchLineStats]);

    // ─── Rush Hour Status ──────────────────────────────────────
    const [rushHourInfo, setRushHourInfo] = useState<{
        name: string; isRushHour: boolean; dayType: string; daypart: string; multiplier: number;
    } | null>(null);

    const fetchRushHour = useCallback(async () => {
        try {
            const res = await fetch('/api/rush-hour');
            if (!res.ok) return;
            const data = await res.json();
            if (data.ok) {
                setRushHourInfo({
                    name: data.timeProfile.name,
                    isRushHour: data.timeProfile.isRushHour,
                    dayType: data.dayType,
                    daypart: data.daypart,
                    multiplier: data.timeProfile.multiplier,
                });
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchRushHour();
        const interval = setInterval(fetchRushHour, 30_000);
        return () => clearInterval(interval);
    }, [fetchRushHour]);

    // ─── Crowdsource Signal Monitoring ──────────────────────────
    const [crowdSignalCount, setCrowdSignalCount] = useState(0);
    const [stallSignalCount, setStallSignalCount] = useState(0);
    const [incidentSignalCount, setIncidentSignalCount] = useState(0);
    const [recentStallReports, setRecentStallReports] = useState<Array<{
        id: string; lineId: string; station: string; severity: string; durationMin: number; at: number;
    }>>([]);
    const [activeIncidents, setActiveIncidents] = useState<Array<{
        id: string; lineId: string; status: string; severity: string; reason: string; station: string; reportCount: number; psa: string; confirmedAt: string;
    }>>([]);
    const [channelStatus, setChannelStatus] = useState<{ crowd: string; stall: string; incidents: string }>({ crowd: 'connecting', stall: 'connecting', incidents: 'connecting' });

    useEffect(() => {
        const supabase = createClient();

        // Subscribe to crowd presence channel
        const crowdChannel = supabase.channel('traintracks:train-presence', {
            config: { broadcast: { self: false } },
        });
        crowdChannel.on('broadcast', { event: 'presence' }, () => {
            setCrowdSignalCount((prev) => prev + 1);
        });
        crowdChannel.subscribe((status: string) => {
            setChannelStatus((prev) => ({ ...prev, crowd: status === 'SUBSCRIBED' ? 'live' : status.toLowerCase() }));
        });

        // Subscribe to stall reports channel
        const stallChannel = supabase.channel('traintracks:stall-reports', {
            config: { broadcast: { self: false } },
        });
        stallChannel.on('broadcast', { event: 'stall' }, ({ payload }: { payload: Record<string, unknown> }) => {
            setStallSignalCount((prev) => prev + 1);
            const report = payload as { id?: string; lineId?: string; nearestStationName?: string; severity?: string; stallDurationMin?: number; reportedAt?: number };
            setRecentStallReports((prev) => [{
                id: (report.id as string) || `stall-${Date.now()}`,
                lineId: (report.lineId as string) || '?',
                station: (report.nearestStationName as string) || 'Unknown',
                severity: (report.severity as string) || 'possible',
                durationMin: (report.stallDurationMin as number) || 0,
                at: (report.reportedAt as number) || Date.now(),
            }, ...prev].slice(0, 10));
        });
        stallChannel.subscribe((status: string) => {
            setChannelStatus((prev) => ({ ...prev, stall: status === 'SUBSCRIBED' ? 'live' : status.toLowerCase() }));
        });

        // Subscribe to incidents channel
        const incidentChannel = supabase.channel('traintracks:incidents', {
            config: { broadcast: { self: false } },
        });
        const handleIncidentEvent = ({ payload }: { payload: Record<string, unknown> }) => {
            setIncidentSignalCount((prev) => prev + 1);
            const evt = payload as { event?: string; incident?: { id?: string; lineId?: string; status?: string; severity?: string; reason?: string; nearestStationName?: string; reportCount?: number; psa?: string; confirmedAt?: string } };
            if (!evt?.incident) return;
            const inc = evt.incident;
            const mapped = {
                id: inc.id || `inc-${Date.now()}`,
                lineId: inc.lineId || '?',
                status: inc.status || 'CONFIRMED',
                severity: inc.severity || 'traffic',
                reason: inc.reason || 'unknown',
                station: inc.nearestStationName || 'Unknown',
                reportCount: inc.reportCount || 0,
                psa: inc.psa || '',
                confirmedAt: inc.confirmedAt || new Date().toISOString(),
            };
            if (evt.event === 'incident_confirmed') {
                setActiveIncidents((prev) => prev.some((i) => i.id === mapped.id) ? prev : [...prev, mapped]);
            } else if (evt.event === 'incident_updated') {
                setActiveIncidents((prev) => prev.map((i) => i.id === mapped.id ? mapped : i));
            } else if (evt.event === 'incident_resolved') {
                setActiveIncidents((prev) => prev.filter((i) => i.id !== mapped.id));
            }
        };
        incidentChannel.on('broadcast', { event: 'incident_confirmed' }, handleIncidentEvent);
        incidentChannel.on('broadcast', { event: 'incident_updated' }, handleIncidentEvent);
        incidentChannel.on('broadcast', { event: 'incident_resolved' }, handleIncidentEvent);
        incidentChannel.subscribe((status: string) => {
            setChannelStatus((prev) => ({ ...prev, incidents: status === 'SUBSCRIBED' ? 'live' : status.toLowerCase() }));
        });

        return () => {
            supabase.removeChannel(crowdChannel);
            supabase.removeChannel(stallChannel);
            supabase.removeChannel(incidentChannel);
        };
    }, []);

    // â”€â”€â”€ Tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [tokensLoading, setTokensLoading] = useState(true);
    const [tokenActionError, setTokenActionError] = useState<string | null>(null);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
    const [newTokenName, setNewTokenName] = useState('');
    const [justGeneratedToken, setJustGeneratedToken] = useState<string | null>(null);

    const fetchTokens = useCallback(async () => {
        setTokensLoading(true);
        setTokenActionError(null);
        try {
            const response = await fetch('/api/admin/api-tokens', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const result = await response.json().catch(() => null) as {
                tokens?: ApiTokenRecord[];
                error?: string | null;
            } | null;
            if (!response.ok) {
                throw new Error(result?.error || 'Unable to load API tokens.');
            }
            setTokens((result?.tokens ?? []).map(mapApiToken));
            localStorage.removeItem('traintracks_api_tokens');
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : 'Unable to load API tokens.');
        } finally {
            setTokensLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTokens();
    }, [fetchTokens]);

    const handleGenerateToken = async () => {
        setTokenActionError(null);
        try {
            const response = await fetch('/api/admin/api-tokens', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTokenName.trim() || `Token ${tokens.length + 1}`,
                    scopes: ['predictions:read'],
                }),
            });
            const result = await response.json().catch(() => null) as {
                token?: string | null;
                record?: ApiTokenRecord | null;
                error?: string | null;
            } | null;
            if (!response.ok || !result?.token || !result.record) {
                throw new Error(result?.error || 'Unable to generate API token.');
            }

            setTokens((current) => [mapApiToken(result.record!), ...current]);
            setJustGeneratedToken(result.token);
            setNewTokenName('');
            setShowGenerateModal(false);
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : 'Unable to generate API token.');
        }
    };

    const handleRevokeToken = async (id: string) => {
        setTokenActionError(null);
        try {
            const response = await fetch(`/api/admin/api-tokens/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
            });
            const result = await response.json().catch(() => null) as { error?: string | null } | null;
            if (!response.ok) {
                throw new Error(result?.error || 'Unable to revoke API token.');
            }
            setTokens((current) => current.filter((token) => token.id !== id));
            setShowRevokeModal(null);
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : 'Unable to revoke API token.');
        }
    };

    // Playground
    const [playground, setPlayground] = useState<PlaygroundState>({
        lineId: 'LRT1',
        direction: '',
        stationId: '',
        scope: 'map',
        limit: '3',
        response: null,
        loading: false,
        url: '',
    });

    const buildPlaygroundUrl = useCallback((state: PlaygroundState) => {
        const params = new URLSearchParams();
        if (state.lineId) params.set('lineId', state.lineId);
        if (state.direction) params.set('direction', state.direction);
        if (state.stationId) params.set('stationId', state.stationId);
        params.set('scope', state.scope);
        params.set('limit', state.limit);
        return `/api/predictions?${params.toString()}`;
    }, []);

    const handlePlaygroundRequest = async () => {
        const url = buildPlaygroundUrl(playground);
        setPlayground((prev) => ({ ...prev, loading: true, url, response: null }));
        try {
            const res = await fetch(url);
            const data = await res.json();
            setPlayground((prev) => ({
                ...prev,
                loading: false,
                response: JSON.stringify(data, null, 2),
            }));
        } catch (err) {
            setPlayground((prev) => ({
                ...prev,
                loading: false,
                response: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
            }));
        }
    };

    const getCurlCommand = () => {
        const url = buildPlaygroundUrl(playground);
        const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
        return `curl -s "${fullUrl}" | jq .`;
    };

    // â”€â”€â”€ CLI Polling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [cliActive, setCliActive] = useState(false);
    const [cliInterval, setCliInterval] = useState(10);
    const [cliLog, setCliLog] = useState<CliLogEntry[]>([]);
    const cliIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const cliLogEndRef = useRef<HTMLDivElement>(null);

    const pollCli = useCallback(async () => {
        try {
            const [r1, r2, r3] = await Promise.all([
                fetch(`/api/predictions?scope=map&lineId=LRT1&limit=${PREDICTION_MAP_LIMIT}`).then(r => r.json()),
                fetch(`/api/predictions?scope=map&lineId=LRT2&limit=${PREDICTION_MAP_LIMIT}`).then(r => r.json()),
                fetch(`/api/predictions?scope=map&lineId=MRT3&limit=${PREDICTION_MAP_LIMIT}`).then(r => r.json()),
            ]);
            setCliLog((prev) => [...prev, {
                timestamp: formatTimestamp(),
                lrt1: r1.predictions?.length ?? 0,
                lrt2: r2.predictions?.length ?? 0,
                mrt3: r3.predictions?.length ?? 0,
                serviceState: r1.serviceState ?? 'unknown',
            }].slice(-100));
        } catch {
            setCliLog((prev) => [...prev, {
                timestamp: formatTimestamp(),
                lrt1: -1,
                lrt2: -1,
                mrt3: -1,
                serviceState: 'error',
            }].slice(-100));
        }
    }, []);

    useEffect(() => {
        if (cliActive) {
            pollCli();
            cliIntervalRef.current = setInterval(pollCli, cliInterval * 1000);
        }
        return () => {
            if (cliIntervalRef.current) clearInterval(cliIntervalRef.current);
        };
    }, [cliActive, cliInterval, pollCli]);

    useEffect(() => {
        cliLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [cliLog]);

    // â”€â”€â”€ Config State (Discord-style staged changes) â”€â”€â”€â”€â”€â”€â”€â”€
    const [apiEnabled, setApiEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem('traintracks_api_enabled');
        return stored !== null ? stored === 'true' : true;
    });
    const [configValues, setConfigValues] = useState({
        defaultLimit: '3',
        validWindowS: '25',
        stationLookaheadMin: '45',
        corsOrigin: '*',
        crowdIntervalMs: '3000',
        crowdMinSpeedKph: '5',
        crowdRequiredSamples: '2',
        stallSampleIntervalMs: '30000',
        stallThresholdKm: '0.1',
        stallWindowSamples: '14',
        stallActivationDistKm: '0.2',
        stallDeviceCooldownMs: '300000',
        stallMaxStationDistKm: '1.5',
        stallMaxReportsPerHour: '6',
        stallMinDurationMin: '3',
    });
    // Staged (unsaved) changes — key → newValue
    const [stagedChanges, setStagedChanges] = useState<Record<string, string>>({});
    const [showApiToggleModal, setShowApiToggleModal] = useState(false);
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [configSaved, setConfigSaved] = useState<string | null>(null);

    // Edit modal state
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [editError, setEditError] = useState<string | null>(null);

    type ConfigMeta = { label: string; description: string; impact: string; min?: number; max?: number; inputType?: 'number' | 'text'; suffix?: string };
    const CONFIG_META: Record<string, ConfigMeta> = {
        defaultLimit: {
            label: 'Default Limit',
            description: 'Maximum number of train predictions returned per direction when no explicit limit is specified by the client.',
            impact: 'All API consumers not specifying a limit will receive more or fewer predictions per request.',
            min: 1, max: 20, suffix: 'trains',
        },
        validWindowS: {
            label: 'API Valid Window',
            description: 'Number of seconds a prediction response is considered fresh. After this window, clients should re-fetch.',
            impact: 'Shorter windows mean more frequent polling; longer windows risk stale data reaching users.',
            min: 5, max: 120, suffix: 's',
        },
        stationLookaheadMin: {
            label: 'Station Lookahead',
            description: 'How far ahead (in minutes) the engine looks when generating station-scope arrival predictions.',
            impact: 'Increasing this shows more distant arrivals but may reduce confidence. Decreasing it limits visible upcoming trains.',
            min: 5, max: 120, suffix: 'min',
        },
        corsOrigin: {
            label: 'CORS Origin',
            description: 'The Access-Control-Allow-Origin header value for the public API. Use * for open access or a specific domain.',
            impact: 'Restricting this will block browser requests from unauthorized domains. Setting to * allows any website to call the API.',
            inputType: 'text' as const,
        },
        crowdIntervalMs: {
            label: 'Broadcast Interval',
            description: 'Minimum milliseconds between crowdsource presence broadcasts from a single device.',
            impact: 'Lower values increase real-time accuracy but raise Supabase Realtime bandwidth. Higher values reduce server load.',
            min: 1000, max: 30000, suffix: 'ms',
        },
        crowdMinSpeedKph: {
            label: 'Min Broadcast Speed',
            description: 'Minimum speed (km/h) a device must be traveling to be eligible to broadcast a presence signal.',
            impact: 'Prevents stationary phones near stations from flooding the crowd signal. Setting too high may filter valid slow-moving trains.',
            min: 0, max: 50, suffix: 'km/h',
        },
        crowdRequiredSamples: {
            label: 'Required Samples',
            description: 'Number of consecutive GPS readings a device needs before its presence is accepted by the server.',
            impact: 'More samples = higher quality signals but slower initial detection. Fewer samples = faster but noisier.',
            min: 1, max: 10, suffix: 'samples',
        },
        stallSampleIntervalMs: {
            label: 'GPS Sample Interval',
            description: 'How often the client samples GPS position during stall monitoring.',
            impact: 'Shorter intervals = faster detection but higher battery drain. Longer intervals = slower detection but better battery life.',
            min: 10000, max: 120000, suffix: 'ms',
        },
        stallThresholdKm: {
            label: 'Movement Threshold',
            description: 'Minimum net distance (km) over the sample window to consider the train as "moving".',
            impact: 'Lower threshold = more sensitive detection (may cause false positives from GPS drift). Higher = less sensitive.',
            min: 0.01, max: 1.0, suffix: 'km',
        },
        stallWindowSamples: {
            label: 'Window Samples',
            description: 'Number of GPS samples to analyze for stall detection. Detection time = samples \u00D7 interval.',
            impact: 'More samples = longer wait before detection but more reliable. Fewer = quicker alert but more false positives.',
            min: 5, max: 30, suffix: 'samples',
        },
        stallActivationDistKm: {
            label: 'Activation Distance',
            description: 'Distance from origin station before stall monitoring activates. Prevents false stalls at boarding station.',
            impact: 'Too low may trigger at the origin station. Too high may miss stalls near the start of a trip.',
            min: 0.05, max: 1.0, suffix: 'km',
        },
        stallDeviceCooldownMs: {
            label: 'Report Cooldown',
            description: 'Minimum time between stall reports from the same device. Prevents spam.',
            impact: 'Shorter cooldown allows faster re-reporting but increases abuse potential. Longer cooldown reduces noise.',
            min: 60000, max: 900000, suffix: 'ms',
        },
        stallMaxStationDistKm: {
            label: 'Max Station Distance',
            description: 'Maximum distance from the nearest station to accept a stall report. Filters out fake reports from outside rail corridors.',
            impact: 'Too small may reject valid reports between stations. Too large weakens geo-fencing protection.',
            min: 0.5, max: 5.0, suffix: 'km',
        },
        stallMaxReportsPerHour: {
            label: 'Hourly Report Cap',
            description: 'Maximum stall reports a single device can submit per hour.',
            impact: 'Lower cap = stronger anti-spam. Higher cap = more flexible for genuine repeated stalls.',
            min: 1, max: 20, suffix: 'reports',
        },
        stallMinDurationMin: {
            label: 'Min Stall Duration',
            description: 'Minimum stall duration (minutes) before a report is accepted. Filters premature reports.',
            impact: 'Higher threshold ensures only real stalls are reported. Lower allows earlier crowd signal contribution.',
            min: 1, max: 15, suffix: 'min',
        },
    };

    const validateConfigValue = (key: string, value: string): string | null => {
        const meta = CONFIG_META[key];
        if (!meta) return null;
        if (meta.inputType === 'text') return null; // text fields have no numeric validation
        const num = Number(value);
        if (!Number.isFinite(num)) return `Must be a number`;
        if (meta.min !== undefined && num < meta.min) return `Minimum is ${meta.min}`;
        if (meta.max !== undefined && num > meta.max) return `Maximum is ${meta.max}`;
        return null;
    };

    const openEditModal = (key: string) => {
        const current = stagedChanges[key] ?? configValues[key as keyof typeof configValues];
        setEditingField(key);
        setEditDraft(current);
        setEditError(null);
    };

    const stageEditChange = () => {
        if (!editingField) return;
        const error = validateConfigValue(editingField, editDraft);
        if (error) { setEditError(error); return; }
        const originalValue = configValues[editingField as keyof typeof configValues];
        if (editDraft === originalValue) {
            // Unstage if reverted to original
            setStagedChanges(prev => { const next = { ...prev }; delete next[editingField!]; return next; });
        } else {
            setStagedChanges(prev => ({ ...prev, [editingField!]: editDraft }));
        }
        setEditingField(null);
    };

    const discardAllChanges = () => {
        setStagedChanges({});
    };

    const commitAllChanges = () => {
        setConfigValues(prev => {
            const next = { ...prev };
            for (const [key, val] of Object.entries(stagedChanges)) {
                (next as Record<string, string>)[key] = val;
                localStorage.setItem(`traintracks_cfg_${key}`, val);
            }
            return next;
        });
        setStagedChanges({});
        setShowCommitModal(false);
        setConfigSaved(`${Object.keys(stagedChanges).length} setting(s) saved`);
        setTimeout(() => setConfigSaved(null), 3000);
    };

    const handleApiToggle = () => {
        const newState = !apiEnabled;
        setApiEnabled(newState);
        localStorage.setItem('traintracks_api_enabled', String(newState));
        setShowApiToggleModal(false);
        setConfigSaved(newState ? 'API Enabled' : 'API Disabled');
        setTimeout(() => setConfigSaved(null), 2500);
    };

    const hasStagedChanges = Object.keys(stagedChanges).length > 0;


    // â”€â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const tabs = [
        { id: 'stats' as const, label: 'Live Stats', icon: Activity },
        { id: 'tokens' as const, label: 'API Tokens', icon: Key },
        { id: 'playground' as const, label: 'Playground', icon: Play },
        { id: 'cli' as const, label: 'CLI Polling', icon: Terminal },
        { id: 'config' as const, label: 'Config', icon: Settings },
        { id: 'docs' as const, label: 'Docs', icon: BookOpen },
    ];

    const totalTrains = lineStats.reduce((sum, line) => sum + line.trainCount, 0);
    const globalServiceState = lineStats.every(l => l.serviceState === 'active')
        ? 'active'
        : lineStats.some(l => l.serviceState === 'active')
            ? 'partial'
            : lineStats[0]?.serviceState ?? 'unknown';

    return (
        <div className="h-screen bg-black text-white font-sans select-none overflow-y-auto api-scroll-container">
            {/* â”€â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Terminal className="w-5 h-5 text-zinc-400" />
                        <div>
                            <h1 className="text-sm font-black tracking-tight">TrainTracks API</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-mono text-zinc-600">v1</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SERVICE_STATE_COLORS[globalServiceState] || 'text-zinc-500 bg-zinc-800'}`}>
                                    {globalServiceState === 'partial' ? 'PARTIAL' : globalServiceState.toUpperCase().replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-600 hidden sm:block">{userEmail}</span>
                        <button
                            onClick={() => { window.location.href = '/'; }}
                            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-500 hover:text-zinc-300"
                            title="Back to app"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* â”€â”€â”€ Tab Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="sticky top-[57px] z-40 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-5xl mx-auto px-4">
                    <div className="flex gap-1 py-2 overflow-x-auto no-scrollbar">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                                    activeTab === tab.id
                                        ? 'bg-white/10 text-white'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                }`}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* â”€â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <main className="max-w-5xl mx-auto px-4 py-6 space-y-6" style={{ animation: 'apiFadeIn 300ms ease-out' }}>

                {/* ══════════════ LIVE STATS ══════════════ */}
                {activeTab === 'stats' && (
                    <section>
                        <SectionHeader icon={Activity} title="Live Train Stats" badge={
                            <button onClick={fetchLineStats} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                                <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                            </button>
                        } />

                        {/* Summary */}
                        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-4">
                            <div className="grid grid-cols-3 gap-4">
                                <StatCard label="Total Trains" value={totalTrains} color="text-white" />
                                <StatCard label="Lines Active" value={lineStats.filter(l => l.serviceState === 'active').length} sub={`of ${lineStats.length}`} color="text-emerald-400" />
                                <StatCard label="Day Type" value={lineStats[0]?.dayType || '—'} color="text-zinc-400" />
                            </div>
                        </div>

                        {/* Rush Hour Status Card */}
                        {rushHourInfo && (
                            <div className={`backdrop-blur-xl border rounded-2xl p-5 mb-4 transition-all ${
                                rushHourInfo.isRushHour
                                    ? 'bg-orange-500/5 border-orange-500/20'
                                    : rushHourInfo.name === 'CLOSED'
                                        ? 'bg-red-500/5 border-red-500/20'
                                        : 'bg-zinc-900/50 border-white/10'
                            }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Clock className={`w-4 h-4 ${rushHourInfo.isRushHour ? 'text-orange-400 animate-pulse' : rushHourInfo.name === 'CLOSED' ? 'text-red-400' : 'text-zinc-500'}`} />
                                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Time Window</span>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                        rushHourInfo.isRushHour
                                            ? 'bg-orange-500/10 text-orange-400'
                                            : rushHourInfo.name === 'CLOSED'
                                                ? 'bg-red-500/10 text-red-400'
                                                : 'bg-zinc-800 text-zinc-500'
                                    }`}>
                                        {rushHourInfo.isRushHour ? 'RUSH HOUR' : rushHourInfo.name === 'CLOSED' ? 'CLOSED' : 'OFF-PEAK'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <div className={`text-lg font-black ${rushHourInfo.isRushHour ? 'text-orange-400' : 'text-white'}`}>{rushHourInfo.name}</div>
                                        <div className="text-[10px] text-zinc-500 font-semibold uppercase">Window</div>
                                    </div>
                                    <div>
                                        <div className="text-lg font-black text-white">{rushHourInfo.daypart.replace(/_/g, ' ')}</div>
                                        <div className="text-[10px] text-zinc-500 font-semibold uppercase">Daypart</div>
                                    </div>
                                    <div>
                                        <div className="text-lg font-black text-white">x{rushHourInfo.multiplier}</div>
                                        <div className="text-[10px] text-zinc-500 font-semibold uppercase">Multiplier</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Per-line cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {lineStats.map((line) => (
                                <div key={line.lineId} className={`${line.bgColor} border ${line.borderColor} backdrop-blur-xl rounded-2xl p-4 transition-all`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className={`text-sm font-black ${line.color}`}>{line.label}</span>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${SERVICE_STATE_COLORS[line.serviceState] || 'text-zinc-500 bg-zinc-800'}`}>
                                            {line.loading ? 'LOADING...' : line.serviceState.toUpperCase().replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <div className={`text-3xl font-black tabular-nums ${line.color}`}>{line.trainCount}</div>
                                    <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-1">Active Trains</div>
                                    {Object.keys(line.directions).length > 0 && (
                                        <div className="flex gap-2 mt-3">
                                            {Object.entries(line.directions).map(([dir, count]) => (
                                                <span key={dir} className="text-[9px] text-zinc-400 bg-black/30 px-2 py-0.5 rounded-full font-mono">
                                                    {dir.slice(0, 2)}: {count}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {line.error && <div className="text-[10px] text-red-400 mt-2">{line.error}</div>}
                                </div>
                            ))}
                        </div>

                        {/* Crowdsource Signal Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            {/* Crowd Presence */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Radio className={`w-4 h-4 ${channelStatus.crowd === 'live' ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'}`} />
                                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Crowd Presence</span>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                        channelStatus.crowd === 'live' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                                    }`}>
                                        {channelStatus.crowd.toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-3xl font-black tabular-nums text-white">{crowdSignalCount}</div>
                                <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-1">Signals This Session</div>
                                <div className="text-[10px] text-zinc-600 mt-2 font-mono">traintracks:train-presence</div>
                            </div>

                            {/* Stall Reports */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className={`w-4 h-4 ${channelStatus.stall === 'live' ? 'text-amber-400 animate-pulse' : 'text-zinc-600'}`} />
                                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Stall Reports</span>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                        channelStatus.stall === 'live' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'
                                    }`}>
                                        {channelStatus.stall.toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-3xl font-black tabular-nums text-white">{stallSignalCount}</div>
                                <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-1">Reports This Session</div>
                                <div className="text-[10px] text-zinc-600 mt-2 font-mono">traintracks:stall-reports</div>
                            </div>
                        </div>

                        {/* Recent Stall Reports Feed */}
                        {recentStallReports.length > 0 && (
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Recent Stall Reports</span>
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ml-auto">
                                        {recentStallReports.length}
                                    </span>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {recentStallReports.map((report) => (
                                        <div key={report.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                                report.severity === 'confirmed_emergency' ? 'bg-red-500/10 text-red-400'
                                                    : report.severity === 'confirmed_traffic' ? 'bg-amber-500/10 text-amber-400'
                                                        : 'bg-zinc-800 text-zinc-500'
                                            }`}>
                                                {report.severity.replace(/_/g, ' ').toUpperCase()}
                                            </span>
                                            <span className="text-xs text-white font-bold">{report.station}</span>
                                            <span className="text-[10px] text-zinc-500">{report.lineId}</span>
                                            <span className="text-[10px] text-zinc-600 ml-auto font-mono">{report.durationMin}min</span>
                                            <span className="text-[10px] text-zinc-700">{new Date(report.at).toLocaleTimeString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Active Incidents */}
                        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mt-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className={`w-4 h-4 ${channelStatus.incidents === 'live' ? 'text-red-400 animate-pulse' : 'text-zinc-600'}`} />
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Incidents</span>
                                </div>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${channelStatus.incidents === 'live' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {channelStatus.incidents.toUpperCase()}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <div className="text-3xl font-black tabular-nums text-white">{activeIncidents.length}</div>
                                    <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-1">Confirmed</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-black tabular-nums text-white">{incidentSignalCount}</div>
                                    <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-1">Events This Session</div>
                                </div>
                            </div>
                            <div className="text-[10px] text-zinc-600 font-mono">traintracks:incidents</div>
                            {activeIncidents.length > 0 && (
                                <div className="space-y-2 mt-3 max-h-48 overflow-y-auto">
                                    {activeIncidents.map((inc) => (
                                        <div key={inc.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${inc.severity === 'emergency' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                {inc.severity.toUpperCase()}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-white font-bold">{inc.station}</span>
                                                    <span className="text-[10px] text-zinc-500">{inc.lineId}</span>
                                                    <span className="text-[10px] text-zinc-600 ml-auto">{inc.reportCount} reports</span>
                                                </div>
                                                <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{inc.psa}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* ══════════════ API TOKENS ══════════════ */}
                {activeTab === 'tokens' && (
                    <section>
                        <SectionHeader icon={Key} title="API Tokens" />

                        {tokenActionError && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-xs text-red-300">
                                {tokenActionError}
                            </div>
                        )}

                        {/* Token list */}
                        <div className="space-y-2 mb-4">
                            {tokensLoading ? (
                                <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center text-sm text-zinc-500">
                                    Loading API tokens...
                                </div>
                            ) : tokens.length === 0 ? (
                                <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                                    <Key className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                    <p className="text-sm text-zinc-500">No API tokens generated yet</p>
                                    <p className="text-xs text-zinc-600 mt-1">Generate a token to access the public prediction API</p>
                                </div>
                            ) : tokens.map((token) => (
                                <div key={token.id} className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-white">{token.name}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <code className="text-xs text-zinc-500 font-mono">
                                                {token.tokenPreview}
                                            </code>
                                        </div>
                                        <div className="text-[10px] text-zinc-600 mt-1">
                                            Created {new Date(token.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setShowRevokeModal(token.id)}
                                            className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-zinc-500 hover:text-red-400"
                                            title="Revoke"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Just-generated token alert */}
                        {justGeneratedToken && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4" style={{ animation: 'apiFadeIn 300ms ease-out' }}>
                                <div className="text-xs font-bold text-emerald-400 mb-1">âœ“ Token Generated Successfully</div>
                                <div className="bg-black/40 rounded-lg p-3 flex items-center gap-2">
                                    <code className="text-xs text-emerald-300 font-mono flex-1 break-all">{justGeneratedToken}</code>
                                    <CopyButton text={justGeneratedToken} />
                                </div>
                                <div className="text-[10px] text-amber-400 mt-2 font-semibold">âš  Copy this token now — it will not be shown again after you leave this page.</div>
                                <button
                                    onClick={() => setJustGeneratedToken(null)}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-2 underline"
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {/* Generate button */}
                        <button
                            onClick={() => setShowGenerateModal(true)}
                            className="w-full py-3.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-semibold hover:bg-white/10 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Generate New Token
                        </button>

                        {/* Generate modal */}
                        {showGenerateModal && (
                            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowGenerateModal(false); }}>
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                                <div className="relative w-full max-w-md bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6" style={{ animation: 'apiFadeIn 200ms ease-out' }}>
                                    <div className="h-1 w-full bg-amber-500 rounded-full absolute top-0 left-0 right-0" />
                                    <h3 className="text-lg font-bold mb-2 mt-2">Generate API Token</h3>
                                    <p className="text-sm text-zinc-400 mb-4">This token grants public read access to the TrainTracks Prediction API. Anyone with this token can query live train positions and forecasts.</p>
                                    <label className="block text-xs text-zinc-500 font-semibold mb-1.5">TOKEN NAME</label>
                                    <input
                                        type="text"
                                        value={newTokenName}
                                        onChange={(e) => setNewTokenName(e.target.value)}
                                        placeholder="e.g. production-key"
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors mb-4"
                                        autoFocus
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateToken(); }}
                                    />
                                    <div className="flex gap-3">
                                        <button onClick={() => setShowGenerateModal(false)} className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 transition-all">Cancel</button>
                                        <button onClick={handleGenerateToken} className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20">Generate</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Revoke modal */}
                        <ApiConfirmModal
                            open={!!showRevokeModal}
                            onClose={() => setShowRevokeModal(null)}
                            onConfirm={() => showRevokeModal && handleRevokeToken(showRevokeModal)}
                            title="Revoke API Token"
                            description="This will permanently delete this token. Any application or service using it will immediately lose access to the TrainTracks API."
                            detail={tokens.find(t => t.id === showRevokeModal)?.name}
                            confirmLabel="Revoke Token"
                            variant="danger"
                            checkboxLabel="I understand this will break any integrations using this token"
                        />
                    </section>
                )}

                {/* ══════════════ PLAYGROUND ══════════════ */}
                {activeTab === 'playground' && (
                    <section>
                        <SectionHeader icon={Play} title="API Playground" />

                        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-4">
                            {/* Controls */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Line</label>
                                    <div className="relative">
                                        <select
                                            value={playground.lineId}
                                            onChange={(e) => setPlayground(prev => ({ ...prev, lineId: e.target.value }))}
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-white/20"
                                        >
                                            <option value="">All Lines</option>
                                            {LINE_CONFIG.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Direction</label>
                                    <div className="relative">
                                        <select
                                            value={playground.direction}
                                            onChange={(e) => setPlayground(prev => ({ ...prev, direction: e.target.value }))}
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-white/20"
                                        >
                                            {DIRECTION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Scope</label>
                                    <div className="relative">
                                        <select
                                            value={playground.scope}
                                            onChange={(e) => setPlayground(prev => ({ ...prev, scope: e.target.value }))}
                                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-white/20"
                                        >
                                            <option value="map">Map (live positions)</option>
                                            <option value="station">Station (ETA arrivals)</option>
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Station ID</label>
                                    <input
                                        value={playground.stationId}
                                        onChange={(e) => setPlayground(prev => ({ ...prev, stationId: e.target.value }))}
                                        placeholder="e.g. M3-04"
                                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Limit</label>
                                    <input
                                        type="number"
                                        value={playground.limit}
                                        onChange={(e) => setPlayground(prev => ({ ...prev, limit: e.target.value }))}
                                        min={1}
                                        max={20}
                                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={handlePlaygroundRequest}
                                    disabled={playground.loading}
                                    className="flex-1 py-3 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {playground.loading ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    Send Request
                                </button>
                                <button
                                    onClick={() => navigator.clipboard.writeText(getCurlCommand())}
                                    className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 transition-all flex items-center gap-2"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">cURL</span>
                                </button>
                            </div>

                            {/* URL Preview */}
                            {playground.url && (
                                <div className="bg-zinc-800/50 border border-white/5 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <span className="text-[10px] text-emerald-400 font-bold">GET</span>
                                    <code className="text-[11px] text-zinc-400 font-mono flex-1 truncate">{playground.url}</code>
                                    <CopyButton text={typeof window !== 'undefined' ? `${window.location.origin}${playground.url}` : playground.url} />
                                </div>
                            )}

                            {/* Response */}
                            {playground.response && (
                                <div className="relative">
                                    <div className="absolute top-2 right-2 z-10">
                                        <CopyButton text={playground.response} />
                                    </div>
                                    <pre className="bg-zinc-950 border border-white/5 rounded-xl p-4 text-[11px] text-zinc-300 font-mono overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
                                        {playground.response}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* ══════════════ CLI POLLING ══════════════ */}
                {activeTab === 'cli' && (
                    <section>
                        <SectionHeader icon={Terminal} title="CLI Polling Mode" badge={
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${cliActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                {cliActive ? 'â— LIVE' : 'â—‹ STOPPED'}
                            </span>
                        } />

                        {/* Controls */}
                        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-4 mb-3 flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => setCliActive(!cliActive)}
                                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center gap-2 ${
                                    cliActive
                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                                }`}
                            >
                                {cliActive ? <Pause className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                                {cliActive ? 'Stop' : 'Start Polling'}
                            </button>

                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-zinc-500 font-bold">INTERVAL</label>
                                <div className="relative">
                                    <select
                                        value={cliInterval}
                                        onChange={(e) => setCliInterval(Number(e.target.value))}
                                        disabled={cliActive}
                                        className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white appearance-none cursor-pointer focus:outline-none disabled:opacity-50"
                                    >
                                        <option value={5}>5s</option>
                                        <option value={10}>10s</option>
                                        <option value={30}>30s</option>
                                        <option value={60}>60s</option>
                                    </select>
                                    <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[10px] text-zinc-600">{cliLog.length} entries</span>
                                {cliLog.length > 0 && (
                                    <>
                                        <button
                                            onClick={() => {
                                                const blob = new Blob([JSON.stringify(cliLog, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `traintracks-cli-${Date.now()}.json`;
                                                a.click();
                                            }}
                                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-zinc-500"
                                            title="Export JSON"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => setCliLog([])}
                                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-zinc-500"
                                            title="Clear"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Terminal */}
                        <div className="bg-zinc-950 border border-white/5 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border-b border-white/5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                                <span className="text-[10px] text-zinc-600 ml-2 font-mono">traintracks-cli — polling</span>
                            </div>
                            <div className="p-4 max-h-[400px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                                {cliLog.length === 0 ? (
                                    <div className="text-zinc-600">
                                        <div>$ traintracks poll --interval {cliInterval}s</div>
                                        <div className="mt-1 text-zinc-700">Waiting for first poll...</div>
                                    </div>
                                ) : cliLog.map((entry, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="text-zinc-600 flex-shrink-0">{entry.timestamp}</span>
                                        <span className="text-zinc-500">â”‚</span>
                                        <span className="text-emerald-400 flex-shrink-0">LRT1:<span className="font-bold">{entry.lrt1 === -1 ? 'ERR' : String(entry.lrt1).padStart(2, ' ')}</span></span>
                                        <span className="text-purple-400 flex-shrink-0">LRT2:<span className="font-bold">{entry.lrt2 === -1 ? 'ERR' : String(entry.lrt2).padStart(2, ' ')}</span></span>
                                        <span className="text-yellow-400 flex-shrink-0">MRT3:<span className="font-bold">{entry.mrt3 === -1 ? 'ERR' : String(entry.mrt3).padStart(2, ' ')}</span></span>
                                        <span className={`${entry.serviceState === 'active' ? 'text-emerald-600' : 'text-zinc-600'}`}>
                                            [{entry.serviceState}]
                                        </span>
                                    </div>
                                ))}
                                <div ref={cliLogEndRef} />
                            </div>
                        </div>
                    </section>
                )}

                {/* ═══════════ CONFIG ═══════════ */}
                {activeTab === 'config' && (
                    <section className="relative">
                        <SectionHeader icon={Settings} title="API Configuration" badge={
                            configSaved ? (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto" style={{ animation: 'apiFadeIn 200ms ease-out' }}>
                                    âœ“ {configSaved}
                                </span>
                            ) : hasStagedChanges ? (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ml-auto animate-pulse">
                                    {Object.keys(stagedChanges).length} unsaved change(s)
                                </span>
                            ) : null
                        } />

                        <div className="space-y-3 pb-20">
                            {/* API Master Toggle */}
                            <div className={`backdrop-blur-xl border rounded-2xl p-5 transition-all ${apiEnabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${apiEnabled ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                                            <Power className={`w-5 h-5 ${apiEnabled ? 'text-emerald-400' : 'text-red-400'}`} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">Public API</div>
                                            <div className={`text-[10px] font-bold uppercase tracking-wider ${apiEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {apiEnabled ? 'ENABLED' : 'DISABLED'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowApiToggleModal(true)}
                                        className={`relative w-14 h-7 rounded-full transition-all ${apiEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-lg transition-all ${apiEnabled ? 'left-[30px]' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-3">
                                    {apiEnabled
                                        ? 'The public prediction API is accepting requests from authenticated third-party consumers.'
                                        : 'The public prediction API is offline. All token-authenticated requests will be rejected.'}
                                </p>
                            </div>

                            <ApiConfirmModal
                                open={showApiToggleModal}
                                onClose={() => setShowApiToggleModal(false)}
                                onConfirm={handleApiToggle}
                                title={apiEnabled ? 'Disable Public API' : 'Enable Public API'}
                                description={apiEnabled
                                    ? 'This will immediately reject all incoming public API requests. Third-party integrations will stop receiving data.'
                                    : 'This will allow authenticated third-party consumers to query the prediction API.'}
                                confirmLabel={apiEnabled ? 'Disable API' : 'Enable API'}
                                variant={apiEnabled ? 'danger' : 'warning'}
                                checkboxLabel={apiEnabled
                                    ? 'I understand this will break all third-party integrations'
                                    : 'I understand this will expose prediction data to token holders'}
                            />

                            {/* Prediction Engine */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Prediction Engine</h3>
                                <div className="space-y-0.5">
                                    <ConfigRow label="Source Version" value={lineStats[0]?.sourceVersion || 'prediction-v1-dispatch-ledger-2026-05'} />
                                    <ClickableConfigRow configKey="defaultLimit" label="Default Limit" value={stagedChanges.defaultLimit ?? configValues.defaultLimit} suffix="trains" isStaged={!!stagedChanges.defaultLimit} onClick={() => openEditModal('defaultLimit')} />
                                    <ClickableConfigRow configKey="validWindowS" label="API Valid Window" value={stagedChanges.validWindowS ?? configValues.validWindowS} suffix="s" isStaged={!!stagedChanges.validWindowS} onClick={() => openEditModal('validWindowS')} />
                                    <ClickableConfigRow configKey="stationLookaheadMin" label="Station Lookahead" value={stagedChanges.stationLookaheadMin ?? configValues.stationLookaheadMin} suffix="min" isStaged={!!stagedChanges.stationLookaheadMin} onClick={() => openEditModal('stationLookaheadMin')} />
                                    <ConfigRow label="Map Lookahead" value="0ms (real-time)" />
                                    <ConfigRow label="Min Headway" value="2 min" />
                                </div>
                            </div>

                            {/* Public API */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Public API</h3>
                                <div className="space-y-0.5">
                                    <ConfigRow label="Endpoint" value="/api/public/predictions" mono />
                                    <ClickableConfigRow configKey="corsOrigin" label="CORS Origin" value={stagedChanges.corsOrigin ?? configValues.corsOrigin} isStaged={!!stagedChanges.corsOrigin} onClick={() => openEditModal('corsOrigin')} />
                                    <ConfigRow label="Methods" value="GET, OPTIONS" />
                                    <ConfigRow label="Auth Methods" value="Bearer / x-api-key" />
                                    <ConfigRow label="SSE Endpoint" value="/api/public/predictions/stream" mono />
                                </div>
                            </div>

                            {/* Crowd Signal */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Crowd Signal</h3>
                                <div className="space-y-0.5">
                                    <ClickableConfigRow configKey="crowdIntervalMs" label="Broadcast Interval" value={stagedChanges.crowdIntervalMs ?? configValues.crowdIntervalMs} suffix="ms" isStaged={!!stagedChanges.crowdIntervalMs} onClick={() => openEditModal('crowdIntervalMs')} />
                                    <ClickableConfigRow configKey="crowdMinSpeedKph" label="Min Speed" value={stagedChanges.crowdMinSpeedKph ?? configValues.crowdMinSpeedKph} suffix="km/h" isStaged={!!stagedChanges.crowdMinSpeedKph} onClick={() => openEditModal('crowdMinSpeedKph')} />
                                    <ClickableConfigRow configKey="crowdRequiredSamples" label="Required Samples" value={stagedChanges.crowdRequiredSamples ?? configValues.crowdRequiredSamples} suffix="samples" isStaged={!!stagedChanges.crowdRequiredSamples} onClick={() => openEditModal('crowdRequiredSamples')} />
                                    <ConfigRow label="Supabase Channel" value="traintracks:train-presence" mono />
                                    <ConfigRow label="Event Name" value="presence" />
                                    <ConfigRow label="Bounds" value="14.30–14.90°N, 120.80–121.30°E" />
                                </div>
                            </div>

                            {/* Confidence Model */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Confidence Model</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                                        <div className="text-lg font-black text-emerald-400">82%</div>
                                        <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">HIGH</div>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                                        <div className="text-lg font-black text-amber-400">62%</div>
                                        <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">MEDIUM</div>
                                    </div>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                                        <div className="text-lg font-black text-red-400">42%</div>
                                        <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">LOW</div>
                                    </div>
                                </div>
                                <div className="text-[10px] text-zinc-600 mt-3">Edge penalty: ±12 min from service start/end → demote one tier</div>
                            </div>

                            {/* Stall Detection */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Stall Detection</h3>
                                <div className="space-y-0.5">
                                    <ClickableConfigRow configKey="stallSampleIntervalMs" label="GPS Sample Interval" value={stagedChanges.stallSampleIntervalMs ?? configValues.stallSampleIntervalMs} suffix="ms" isStaged={!!stagedChanges.stallSampleIntervalMs} onClick={() => openEditModal('stallSampleIntervalMs')} />
                                    <ClickableConfigRow configKey="stallThresholdKm" label="Movement Threshold" value={stagedChanges.stallThresholdKm ?? configValues.stallThresholdKm} suffix="km" isStaged={!!stagedChanges.stallThresholdKm} onClick={() => openEditModal('stallThresholdKm')} />
                                    <ClickableConfigRow configKey="stallWindowSamples" label="Window Samples" value={stagedChanges.stallWindowSamples ?? configValues.stallWindowSamples} suffix="samples" isStaged={!!stagedChanges.stallWindowSamples} onClick={() => openEditModal('stallWindowSamples')} />
                                    <ClickableConfigRow configKey="stallActivationDistKm" label="Activation Distance" value={stagedChanges.stallActivationDistKm ?? configValues.stallActivationDistKm} suffix="km" isStaged={!!stagedChanges.stallActivationDistKm} onClick={() => openEditModal('stallActivationDistKm')} />
                                    <ConfigRow label="Detection Time" value={`${Math.round((Number(stagedChanges.stallWindowSamples ?? configValues.stallWindowSamples) * Number(stagedChanges.stallSampleIntervalMs ?? configValues.stallSampleIntervalMs)) / 60000)} min`} />
                                    <ConfigRow label="Underground Skip" value="Enabled" />
                                </div>
                            </div>

                            {/* Stall Report Anti-Abuse */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Stall Report Anti-Abuse</h3>
                                </div>
                                <div className="space-y-0.5">
                                    <ClickableConfigRow configKey="stallDeviceCooldownMs" label="Report Cooldown" value={stagedChanges.stallDeviceCooldownMs ?? configValues.stallDeviceCooldownMs} suffix="ms" isStaged={!!stagedChanges.stallDeviceCooldownMs} onClick={() => openEditModal('stallDeviceCooldownMs')} />
                                    <ClickableConfigRow configKey="stallMaxStationDistKm" label="Max Station Distance" value={stagedChanges.stallMaxStationDistKm ?? configValues.stallMaxStationDistKm} suffix="km" isStaged={!!stagedChanges.stallMaxStationDistKm} onClick={() => openEditModal('stallMaxStationDistKm')} />
                                    <ClickableConfigRow configKey="stallMaxReportsPerHour" label="Hourly Report Cap" value={stagedChanges.stallMaxReportsPerHour ?? configValues.stallMaxReportsPerHour} suffix="reports" isStaged={!!stagedChanges.stallMaxReportsPerHour} onClick={() => openEditModal('stallMaxReportsPerHour')} />
                                    <ClickableConfigRow configKey="stallMinDurationMin" label="Min Stall Duration" value={stagedChanges.stallMinDurationMin ?? configValues.stallMinDurationMin} suffix="min" isStaged={!!stagedChanges.stallMinDurationMin} onClick={() => openEditModal('stallMinDurationMin')} />
                                    <ConfigRow label="Supabase Channel" value="traintracks:stall-reports" mono />
                                    <ConfigRow label="Service Hours" value="04:30–23:00 PHT" />
                                    <ConfigRow label="Geo-fence" value="14.30–14.90°N, 120.80–121.30°E" />
                                </div>
                            </div>

                            {/* Incident Aggregator */}
                            <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Incident Aggregator</h3>
                                </div>
                                <div className="space-y-0.5">
                                    <ConfigRow label="Quorum Devices" value="3" />
                                    <ConfigRow label="Quorum Window" value="10 min" />
                                    <ConfigRow label="Cluster Radius" value="2.0 km" />
                                    <ConfigRow label="Auto-Expire TTL" value="30 min" />
                                    <ConfigRow label="Resolve Quorum" value="3 votes" />
                                    <ConfigRow label="Max Per Line" value="3" />
                                    <ConfigRow label="Supabase Channel" value="traintracks:incidents" mono />
                                    <ConfigRow label="Events" value="confirmed / updated / resolved" />
                                </div>
                            </div>
                        </div>

                        {/* â”€â”€â”€ Edit Field Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        {editingField && CONFIG_META[editingField] && (
                            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditingField(null); }}>
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'acmFadeIn 150ms ease-out' }} />
                                <div className="relative w-full max-w-md bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'acmSlideUp 200ms ease-out' }}>
                                    <div className="h-1 w-full bg-amber-500" />
                                    <div className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-white">{CONFIG_META[editingField].label}</h3>
                                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{CONFIG_META[editingField].description}</p>
                                            </div>
                                            <button onClick={() => setEditingField(null)} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1">
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-amber-300 leading-relaxed">{CONFIG_META[editingField].impact}</p>
                                        </div>

                                        <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-1">Current value</div>
                                        <div className="text-sm text-zinc-400 font-mono mb-4">
                                            {configValues[editingField as keyof typeof configValues]}
                                            {CONFIG_META[editingField].suffix ? ` ${CONFIG_META[editingField].suffix}` : ''}
                                        </div>

                                        <div className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider mb-1">New value</div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <input
                                                type={CONFIG_META[editingField].inputType || 'number'}
                                                value={editDraft}
                                                onChange={(e) => { setEditDraft(e.target.value); setEditError(null); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') stageEditChange(); if (e.key === 'Escape') setEditingField(null); }}
                                                autoFocus
                                                className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-amber-500/50 transition-colors"
                                            />
                                            {CONFIG_META[editingField].suffix && (
                                                <span className="text-xs text-zinc-500 font-mono">{CONFIG_META[editingField].suffix}</span>
                                            )}
                                        </div>
                                        {CONFIG_META[editingField].min !== undefined && (
                                            <div className="text-[10px] text-zinc-700 mb-3">Range: {CONFIG_META[editingField].min} – {CONFIG_META[editingField].max}</div>
                                        )}
                                        {editError && (
                                            <div className="text-[11px] text-red-400 mb-3 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" /> {editError}
                                            </div>
                                        )}

                                        <div className="flex gap-3 mt-4">
                                            <button onClick={() => setEditingField(null)} className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700 transition-all active:scale-[0.98]">
                                                Cancel
                                            </button>
                                            <button onClick={stageEditChange} className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20">
                                                Stage Change
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* â”€â”€â”€ Discord-style Unsaved Changes Bar â”€â”€â”€â”€ */}
                        {hasStagedChanges && (
                            <div className="sticky bottom-4 z-50 mx-auto max-w-lg" style={{ animation: 'unsavedSlideUp 300ms ease-out' }}>
                                <div className="bg-zinc-900/95 backdrop-blur-xl border border-amber-500/20 rounded-2xl px-5 py-3.5 shadow-2xl shadow-black/50 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                        <span className="text-sm text-zinc-200 font-semibold truncate">
                                            Careful — you have {Object.keys(stagedChanges).length} unsaved change{Object.keys(stagedChanges).length > 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button onClick={discardAllChanges} className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
                                            Reset
                                        </button>
                                        <button onClick={() => setShowCommitModal(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.97]">
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* â”€â”€â”€ Commit Confirmation Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                        <ApiConfirmModal
                            open={showCommitModal}
                            onClose={() => setShowCommitModal(false)}
                            onConfirm={commitAllChanges}
                            title="Apply Configuration Changes"
                            description={`You are about to apply ${Object.keys(stagedChanges).length} change(s) to the live API configuration. These changes take effect immediately for all connected clients.`}
                            detail={Object.entries(stagedChanges).map(([key, newVal]) => {
                                const meta = CONFIG_META[key];
                                const oldVal = configValues[key as keyof typeof configValues];
                                return `${meta?.label || key}\n  Old: ${oldVal}${meta?.suffix ? ' ' + meta.suffix : ''}\n  New: ${newVal}${meta?.suffix ? ' ' + meta.suffix : ''}`;
                            }).join('\n\n')}
                            confirmLabel="Apply All Changes"
                            variant="warning"
                            checkboxLabel="I understand these changes take effect immediately"
                        />
                    </section>
                )}


                {/* ══════════════ DOCS ══════════════ */}
                {activeTab === 'docs' && (
                    <section>
                        <ApiDocs embedded={true} />
                    </section>
                )}
            </main>

            <style jsx>{`
                @keyframes apiFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes acmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes acmSlideUp {
                    from { opacity: 0; transform: translateY(16px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes unsavedSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .api-scroll-container::-webkit-scrollbar { display: none; }
                .api-scroll-container { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}

// â”€â”€â”€ Config Row Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between items-center py-1.5">
            <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">{label}</span>
            <span className={`text-[11px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );
}

function ClickableConfigRow({ configKey, label, value, suffix, isStaged, onClick }: {
    configKey: string;
    label: string;
    value: string;
    suffix?: string;
    isStaged: boolean;
    onClick: () => void;
}) {
    return (
        <div className="flex justify-between items-center py-1.5 group cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors" onClick={onClick}>
            <div className="flex items-center gap-2">
                {isStaged && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isStaged ? 'text-amber-400' : 'text-zinc-600'}`}>{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-mono ${isStaged ? 'text-amber-300' : 'text-zinc-300'}`}>{value}{suffix ? ` ${suffix}` : ''}</span>
                <Settings className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>
    );
}
