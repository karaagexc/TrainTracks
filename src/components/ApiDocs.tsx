"use client";

import Link from "next/link";
import { useState } from "react";
import {
    BookOpen, Terminal, ChevronRight, Copy, Check, ExternalLink,
    Zap, Shield, Clock, MapPin, Train, Radio, AlertTriangle, ArrowLeft,
} from "lucide-react";

// â”€â”€â”€ Copy Button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CopyBlock({ text, language = "bash" }: { text: string; language?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="relative group">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 z-10"
                title="Copy"
            >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
            </button>
            <pre className="bg-zinc-950 border border-white/5 rounded-xl p-4 text-[11px] text-zinc-300 font-mono overflow-x-auto leading-relaxed">
                <code>{text}</code>
            </pre>
        </div>
    );
}

// â”€â”€â”€ Section Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-28">
            <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-zinc-600" />
                {title}
            </h2>
            <div className="space-y-4 pl-6">{children}</div>
        </section>
    );
}

function Param({ name, type, required, description, defaultValue }: {
    name: string; type: string; required?: boolean; description: string; defaultValue?: string;
}) {
    return (
        <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
            <div className="flex-shrink-0 min-w-[120px]">
                <code className="text-xs text-amber-400 font-mono font-bold">{name}</code>
                {required && <span className="text-[8px] text-red-400 font-bold ml-1.5 uppercase">required</span>}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-purple-400 font-mono bg-purple-500/10 px-1.5 py-0.5 rounded">{type}</span>
                    {defaultValue && <span className="text-[10px] text-zinc-600">default: <code className="text-zinc-500">{defaultValue}</code></span>}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

function ResponseField({ name, type, description }: { name: string; type: string; description: string }) {
    return (
        <div className="flex gap-3 py-2 border-b border-white/5 last:border-0">
            <code className="text-[11px] text-emerald-400 font-mono font-bold flex-shrink-0 min-w-[160px]">{name}</code>
            <span className="text-[10px] text-purple-400 font-mono flex-shrink-0">{type}</span>
            <p className="text-[11px] text-zinc-400 flex-1">{description}</p>
        </div>
    );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
    return (
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${color}`}>{children}</span>
    );
}

function MethodBadge({ method }: { method: string }) {
    const colors: Record<string, string> = {
        GET: 'bg-emerald-500/10 text-emerald-400',
        POST: 'bg-blue-500/10 text-blue-400',
        DELETE: 'bg-red-500/10 text-red-400',
    };
    return <Badge color={colors[method] || 'bg-zinc-800 text-zinc-400'}>{method}</Badge>;
}

// â”€â”€â”€ Navigation Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NAV_SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'authentication', label: 'Authentication' },
    { id: 'endpoints', label: 'Endpoints' },
    { id: 'predictions', label: 'GET /predictions' },
    { id: 'public-predictions', label: 'GET /public/predictions' },
    { id: 'crowd-presence', label: 'POST /crowd/presence' },
    { id: 'congestion', label: 'GET /congestion' },
    { id: 'rush-hour', label: 'GET /rush-hour' },
    { id: 'stall-config', label: 'GET /stall-config' },
    { id: 'stall-report', label: 'POST /stall-report' },
    { id: 'incidents', label: 'GET /incidents' },
    { id: 'incidents-resolve', label: 'POST /incidents/resolve' },
    { id: 'response-format', label: 'Response Format' },
    { id: 'service-states', label: 'Service States' },
    { id: 'confidence-model', label: 'Confidence Model' },
    { id: 'schedules', label: 'Service Schedules' },
    { id: 'rate-limits', label: 'Rate Limits' },
    { id: 'errors', label: 'Error Handling' },
    { id: 'examples', label: 'Examples' },
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  API DOCUMENTATION PAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function ApiDocs({ embedded = false }: { embedded?: boolean }) {
    const [activeSection, setActiveSection] = useState('overview');

    const handleNavClick = (id: string) => {
        setActiveSection(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className={`${embedded ? '' : 'h-screen bg-black overflow-y-auto docs-scroll-container'} text-white font-sans`}>
            {/* Header â€” only show if not embedded */}
            {!embedded && (
                <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link href="/" className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-500">
                                <ArrowLeft className="w-4 h-4" />
                            </Link>
                            <BookOpen className="w-5 h-5 text-zinc-400" />
                            <div>
                                <h1 className="text-sm font-black tracking-tight">TrainTracks API Docs</h1>
                                <span className="text-[9px] font-mono text-zinc-600">v1 Â· prediction-v1-dispatch-ledger-2026-05</span>
                            </div>
                        </div>
                        <Link
                            href="/api-console"
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
                        >
                            API Console <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>
                </header>
            )}

            <div className="max-w-6xl mx-auto flex">
                {/* Sidebar Nav */}
                <nav className={`hidden lg:block w-56 flex-shrink-0 ${embedded ? 'sticky top-0' : 'sticky top-[57px]'} h-fit py-6 pr-6`}>
                    <div className="space-y-0.5">
                        {NAV_SECTIONS.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => handleNavClick(section.id)}
                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                    activeSection === section.id
                                        ? 'bg-white/10 text-white font-semibold'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                }`}
                            >
                                {section.label}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-4 py-6 space-y-12 pb-32">

                    {/* â•â•â•â•â•â•â•â•â•â• OVERVIEW â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="overview" title="Overview">
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            The TrainTracks Prediction API provides schedule-derived train position forecasts and arrival estimates
                            for Manila&apos;s urban rail network â€” <strong className="text-white">LRT-1</strong>, <strong className="text-white">LRT-2</strong>, and <strong className="text-white">MRT-3</strong>.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <Zap className="w-5 h-5 text-amber-400 mb-2" />
                                <div className="text-xs font-bold text-white">Modelled</div>
                                <div className="text-[10px] text-zinc-500 mt-1">Schedule/headway estimates are recalculated per request; they are not an operator vehicle feed.</div>
                            </div>
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <Shield className="w-5 h-5 text-emerald-400 mb-2" />
                                <div className="text-xs font-bold text-white">Authenticated</div>
                                <div className="text-[10px] text-zinc-500 mt-1">Public API requires a scoped Bearer or X-API-Key token. First-party routes are app-only.</div>
                            </div>
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <Clock className="w-5 h-5 text-blue-400 mb-2" />
                                <div className="text-xs font-bold text-white">Schedule-aware</div>
                                <div className="text-[10px] text-zinc-500 mt-1">Automatically adjusts for day type, holidays, and service hours.</div>
                            </div>
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">Base URL</div>
                            <code className="text-sm text-emerald-400 font-mono">https://traintracks.vercel.app</code>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• AUTHENTICATION â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="authentication" title="Authentication">
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            The <strong className="text-white">internal API</strong> (<code className="text-xs text-zinc-300 font-mono">/api/predictions</code>) requires no authentication â€” it&apos;s used by the TrainTracks app itself.
                        </p>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            The <strong className="text-white">public API</strong> (<code className="text-xs text-zinc-300 font-mono">/api/public/predictions</code>) requires authentication via one of these methods:
                        </p>
                        <div className="space-y-2 mt-3">
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Option 1 â€” Bearer Token (recommended)</div>
                                <CopyBlock text={`curl -H "Authorization: Bearer YOUR_API_TOKEN" \\
  https://traintracks.vercel.app/api/public/predictions?lineId=MRT3&scope=map`} />
                            </div>
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Option 2 â€” X-API-Key Header</div>
                                <CopyBlock text={`curl -H "X-API-Key: YOUR_API_TOKEN" \\
  https://traintracks.vercel.app/api/public/predictions?lineId=LRT1&scope=station`} />
                            </div>
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Required Token Scopes</div>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    <code>predictions:read</code> for forecasts, congestion, rush-hour, and stall configuration; <code>incidents:read</code> or <code>incidents:write</code> for disruption workflows; <code>crowd:write</code> for public crowd submissions.
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mt-3 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300">
                                Generate tokens in the <Link
                            href="/api-console" className="underline hover:text-amber-200">API Console</Link>. Never expose tokens in client-side code.
                            </p>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• ENDPOINTS â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="endpoints" title="Endpoints">
                        <div className="space-y-2">
                            {[
                                { method: 'GET', path: '/api/predictions', auth: 'None', desc: 'Internal prediction API (used by the app)' },
                                { method: 'GET', path: '/api/public/predictions', auth: 'predictions:read', desc: 'Public schedule-model API for third-party consumers' },
                                { method: 'POST', path: '/api/crowd/presence', auth: 'None', desc: 'Submit crowdsourced GPS train presence' },
                                { method: 'GET', path: '/api/public/congestion', auth: 'predictions:read', desc: 'Station congestion snapshot with tier & reason' },
                                { method: 'GET', path: '/api/public/rush-hour', auth: 'predictions:read', desc: 'Current rush hour time window classification' },
                                { method: 'GET', path: '/api/public/stall-config', auth: 'predictions:read', desc: 'Stall detection thresholds & configuration' },
                                { method: 'POST', path: '/api/public/stall-report', auth: 'incidents:write', desc: 'Submit a durable crowdsourced stall signal' },
                                { method: 'GET', path: '/api/public/incidents', auth: 'incidents:read', desc: 'List active confirmed service disruption incidents' },
                                { method: 'POST', path: '/api/public/incidents/resolve', auth: 'incidents:write', desc: 'Vote to resolve a confirmed incident' },
                                { method: 'POST', path: '/api/public/crowd/presence', auth: 'crowd:write', desc: 'Submit public crowd train presence' },
                            ].map((ep) => (
                                <div key={ep.path} className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                                    <MethodBadge method={ep.method} />
                                    <code className="text-xs text-white font-mono font-bold flex-1">{ep.path}</code>
                                    <Badge color={ep.auth !== 'None' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'}>{ep.auth}</Badge>
                                </div>
                            ))}
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /predictions â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="predictions" title="GET /api/predictions">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Returns predicted train positions or station arrival times. No authentication required.
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Query Parameters</div>
                            <Param name="lineId" type="string" description="Filter by rail line. Accepts: LRT1, LRT2, MRT3. Also accepts hyphenated forms (LRT-1)." />
                            <Param name="direction" type="string" description="Filter by direction. Values: NORTHBOUND, SOUTHBOUND, EASTBOUND, WESTBOUND. LRT-2 uses EAST/WESTBOUND." />
                            <Param name="stationId" type="string" description="Filter arrivals for a specific station (e.g. M3-04, L1-20). Most useful with scope=station." />
                            <Param name="scope" type="string" defaultValue="station" description="Prediction mode. 'map' = current live positions (lat/lng). 'station' = upcoming arrivals at stations (ETA)." />
                            <Param name="mode" type="string" defaultValue="live" description="Operational mode. 'live' = production lines only. 'sandbox' = includes MRT-7." />
                            <Param name="limit" type="number" defaultValue="3" description="Maximum number of predictions to return per direction." />
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /public/predictions â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="public-predictions" title="GET /api/public/predictions">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Identical to <code className="text-xs text-zinc-300 font-mono">/api/predictions</code> but requires authentication. Intended for third-party developers and external applications. Includes CORS headers for browser access.
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">CORS Configuration</div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="text-[10px] text-zinc-600">Access-Control-Allow-Origin</div>
                                <code className="text-[10px] text-zinc-300 font-mono">*</code>
                                <div className="text-[10px] text-zinc-600">Access-Control-Allow-Methods</div>
                                <code className="text-[10px] text-zinc-300 font-mono">GET, OPTIONS</code>
                                <div className="text-[10px] text-zinc-600">Access-Control-Allow-Headers</div>
                                <code className="text-[10px] text-zinc-300 font-mono">Authorization, X-API-Key, Content-Type</code>
                            </div>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• POST /crowd/presence â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="crowd-presence" title="POST /api/crowd/presence">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Submit real-time GPS-based train presence data from a crowdsource participant. The server validates the payload, hashes the device ID for anonymity, and broadcasts to all connected clients via Supabase Realtime.
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mb-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Request Body (JSON)</div>
                            <Param name="deviceId" type="string" required description="Anonymous device identifier (8â€“128 chars). SHA-256 hashed server-side." />
                            <Param name="lineId" type="string" required description="Rail line: LRT1, LRT2, or MRT3." />
                            <Param name="direction" type="string" required description="Travel direction. Must match line axis (NB/SB for LRT1/MRT3, EB/WB for LRT2)." />
                            <Param name="lat" type="number" required description="Latitude (WGS84). Must be within Metro Manila bounds (14.30â€“14.90Â°N)." />
                            <Param name="lng" type="number" required description="Longitude (WGS84). Must be within Metro Manila bounds (120.80â€“121.30Â°E)." />
                            <Param name="statusCode" type="string" required description="Train status: AT_STATION, LEAVING_STATION, IN_TRANSIT, or APPROACHING_STATION." />
                            <Param name="stationId" type="string" description="Nearest station ID (e.g. M3-04). Validated against the station database." />
                            <Param name="speedKph" type="number" defaultValue="0" description="Current speed in km/h. Clamped to 0â€“120." />
                            <Param name="confidence" type="number" defaultValue="0.5" description="Signal confidence (0.35â€“0.98). Clamped server-side." />
                        </div>

                        <CopyBlock language="bash" text={`curl -X POST https://traintracks.vercel.app/api/crowd/presence \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceId": "my-device-uuid-here",
    "lineId": "MRT3",
    "direction": "NORTHBOUND",
    "lat": 14.5547,
    "lng": 121.0244,
    "statusCode": "IN_TRANSIT",
    "speedKph": 35,
    "confidence": 0.7
  }'`} />
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /congestion â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="congestion" title="GET /api/public/congestion">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Returns a real-time congestion snapshot for a specific station. Includes tier classification,
                            crowd confidence, reason codes, contextual tips, and active events. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Query Parameters</div>
                            <Param name="station" type="string" required description="Station ID (e.g. M3-11, L1-23, L2-08). See station list for valid IDs." />
                            <Param name="direction" type="string" description="Travel direction: NORTH or SOUTH. Auto-selects worst-case if omitted." />
                            <Param name="line" type="string" description="Line ID: LRT1, LRT2, MRT3. Auto-inferred from station ID if omitted." />
                            <Param name="at" type="ISO 8601" description="Timestamp to compute congestion for. Defaults to current time." defaultValue="now" />
                        </div>

                        <CopyBlock text={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://traintracks.vercel.app/api/public/congestion?station=M3-11"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Response Fields</div>
                            <ResponseField name="congestion.score" type="number" description="Raw congestion score (0â€“7 scale)" />
                            <ResponseField name="congestion.tier" type="string" description="LOW | MODERATE | HIGH | EXTREME" />
                            <ResponseField name="congestion.label" type="string" description="Human-readable tier label (Light, Moderate, Heavy, Extreme)" />
                            <ResponseField name="congestion.reason" type="string?" description="Why this station is busy (e.g. 'LRT-2 interconnect â€” Gateway Mall')" />
                            <ResponseField name="congestion.tip" type="string?" description="Station-specific commuter tip" />
                            <ResponseField name="congestion.timeWindow" type="string" description="Current time window (AM RUSH, PM RUSH, OFF-PEAK, CLOSED, etc.)" />
                            <ResponseField name="congestion.dayType" type="string" description="monday | weekday | friday | saturday | sunday | holiday" />
                            <ResponseField name="congestion.daypart" type="string" description="am_peak | pm_peak | midday | early_morning | late_evening | closed" />
                            <ResponseField name="congestion.confidence" type="string" description="low | medium | high â€” based on data sources" />
                            <ResponseField name="congestion.reasonCodes" type="string[]" description="Machine-readable reason codes (forecast_weight, crowd_signal, etc.)" />
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Congestion Tiers</div>
                            <div className="space-y-2">
                                {[
                                    { tier: 'LOW', color: 'text-emerald-400', desc: 'Seats available. Score < 2.0' },
                                    { tier: 'MODERATE', color: 'text-yellow-400', desc: 'Standing room only. Score 2.0â€“3.4' },
                                    { tier: 'HIGH', color: 'text-orange-400', desc: 'Expect 15â€“20 min queues. Score 3.5â€“4.4' },
                                    { tier: 'EXTREME', color: 'text-red-400', desc: 'Queue spilling to street level. Score 4.5+' },
                                ].map((t) => (
                                    <div key={t.tier} className="flex items-center gap-3">
                                        <code className={`text-xs font-mono font-bold ${t.color} min-w-[80px]`}>{t.tier}</code>
                                        <span className="text-xs text-zinc-400">{t.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /rush-hour â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="rush-hour" title="GET /api/public/rush-hour">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Returns the current time window classification for Metro Manila rail service.
                            Useful for determining if it&apos;s rush hour, off-peak, or closed. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Query Parameters</div>
                            <Param name="at" type="ISO 8601" description="Timestamp to compute time window for. Defaults to current time." defaultValue="now" />
                        </div>

                        <CopyBlock text={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://traintracks.vercel.app/api/public/rush-hour"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Response Fields</div>
                            <ResponseField name="timeProfile.name" type="string" description="Window name: AM RUSH, PM RUSH, FRIDAY RUSH, OFF-PEAK, DEEP_OFF_PEAK, CLOSED, etc." />
                            <ResponseField name="timeProfile.multiplier" type="number" description="Congestion multiplier (1.0 = peak, 0.4 = off-peak, 0 = closed)" />
                            <ResponseField name="timeProfile.primaryFlow" type="string?" description="POSITIVE (southbound/eastbound) or NEGATIVE (northbound/westbound)" />
                            <ResponseField name="timeProfile.isHolidayMode" type="boolean" description="Whether a holiday override is active" />
                            <ResponseField name="timeProfile.isRushHour" type="boolean" description="Convenience flag: true if window name contains RUSH" />
                            <ResponseField name="dayType" type="string" description="monday | weekday | friday | saturday | sunday | holiday" />
                            <ResponseField name="daypart" type="string" description="am_peak | pm_peak | midday | early_morning | late_evening | closed" />
                            <ResponseField name="schedule" type="object" description="Static reference: AM/PM rush, off-peak, and closed time ranges" />
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Time Windows</div>
                            <div className="space-y-2">
                                {[
                                    { name: 'AM RUSH', time: '06:30â€“09:30 (12:00 Fri)', mult: '1.0' },
                                    { name: 'PM RUSH', time: '17:00â€“20:30', mult: '1.0' },
                                    { name: 'FRIDAY RUSH', time: '15:00â€“22:00', mult: '1.5' },
                                    { name: 'OFF-PEAK', time: 'Gaps between rushes', mult: '0.4' },
                                    { name: 'DEEP_OFF_PEAK', time: '11:00â€“16:00', mult: '0.3' },
                                    { name: 'CLOSED', time: '23:00â€“04:30', mult: '0' },
                                ].map((w) => (
                                    <div key={w.name} className="flex items-center gap-3">
                                        <code className="text-xs text-amber-400 font-mono font-bold min-w-[120px]">{w.name}</code>
                                        <span className="text-xs text-zinc-500 min-w-[140px]">{w.time}</span>
                                        <span className="text-xs text-zinc-600">x{w.mult}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /stall-config â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="stall-config" title="GET /api/public/stall-config">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Returns the stall detection configuration and thresholds. Stall detection runs client-side
                            using GPS â€” this endpoint provides the configuration parameters only. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <CopyBlock text={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://traintracks.vercel.app/api/public/stall-config"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Config Fields</div>
                            <ResponseField name="config.sampleIntervalMs" type="number" description="GPS sampling interval in milliseconds (default: 30000)" />
                            <ResponseField name="config.thresholdKm" type="number" description="Movement threshold in km â€” below this = stalled (default: 0.1)" />
                            <ResponseField name="config.windowSamples" type="number" description="Number of consecutive samples to analyze (default: 14)" />
                            <ResponseField name="config.activationDistKm" type="number" description="Distance from origin before detection activates (default: 0.2)" />
                            <ResponseField name="config.autoDismissMs" type="number" description="Auto-dismiss timeout if user doesn't respond (default: 15000)" />
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Derived Values</div>
                            <ResponseField name="derived.detectionTimeMinutes" type="number" description="How long before stall triggers (windowSamples x sampleInterval)" />
                            <ResponseField name="derived.movementThresholdMeters" type="number" description="Threshold in meters (thresholdKm x 1000)" />
                            <ResponseField name="derived.activationDistanceMeters" type="number" description="Activation distance in meters" />
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                <span className="text-xs text-amber-400 font-bold">Implementation Note</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                Stall detection requires continuous GPS access on the client device. The server cannot detect stalls â€”
                                it only provides the configuration. Underground stations are automatically skipped (no GPS signal).
                            </p>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• POST /stall-report â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="stall-report" title="POST /api/public/stall-report">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Submit a crowdsourced stall signal. When a client&apos;s local stall detector triggers, it can report
                            the stall here. The signal is broadcast via Supabase Realtime so other clients on the same line
                            receive proactive warnings before their own 7-minute threshold. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Request Body (JSON)</div>
                            <Param name="deviceId" type="string" required description="Anonymous device identifier (8-128 chars). Hashed server-side for privacy." />
                            <Param name="lineId" type="string" required description="Rail line: LRT1, LRT2, or MRT3." />
                            <Param name="lat" type="number" required description="GPS latitude (must be within Metro Manila bounds)." />
                            <Param name="lng" type="number" required description="GPS longitude (must be within Metro Manila bounds)." />
                            <Param name="severity" type="string" required description="possible | confirmed_traffic | confirmed_emergency" />
                            <Param name="stallDurationMin" type="number" required description="How many minutes the train has been stalled (1-180)." />
                            <Param name="reason" type="string" description="Optional stall reason: unknown, signal_issue, mechanical, passenger_incident, congestion, weather, other." />
                            <Param name="message" type="string" description="Optional user message (sanitized, max 200 chars)." />
                        </div>

                        <CopyBlock text={`curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceId": "anon-device-abc123xy",
    "lineId": "LRT1",
    "lat": 14.5384,
    "lng": 120.9986,
    "severity": "possible",
    "stallDurationMin": 7
  }' \\
  "https://traintracks.vercel.app/api/public/stall-report"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Response Fields</div>
                            <ResponseField name="report.id" type="string" description="Unique stall report ID (STALL-{hash}-{timestamp})" />
                            <ResponseField name="report.nearestStationId" type="string?" description="Nearest station to the stall location (auto-detected)" />
                            <ResponseField name="report.nearestStationName" type="string?" description="Human-readable station name" />
                            <ResponseField name="report.severity" type="string" description="The reported severity level" />
                            <ResponseField name="report.deviceHash" type="string" description="Anonymized device hash (first 12 chars of SHA-256)" />
                            <ResponseField name="broadcast.status" type="number" description="Supabase Realtime broadcast HTTP status" />
                        </div>

                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Radio className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-emerald-400 font-bold">Realtime Integration</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                Stall reports are broadcast on the <code className="text-xs text-zinc-300 font-mono">traintracks:stall-reports</code> Supabase
                                Realtime channel. Subscribe to this channel to receive live stall alerts from other users on the network.
                            </p>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• GET /incidents â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="incidents" title="GET /api/public/incidents">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            List active confirmed service disruption incidents. Incidents are created when the aggregator
                            receives &ge;3 unique stall reports within 10 minutes and 2km radius. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Query Parameters</div>
                            <Param name="line" type="string" description="Filter by line ID: LRT1, LRT2, or MRT3. Omit to list all lines." />
                        </div>

                        <CopyBlock text={`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "https://traintracks.vercel.app/api/public/incidents?line=LRT1"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Response Fields</div>
                            <ResponseField name="ok" type="boolean" description="Whether the request succeeded" />
                            <ResponseField name="incidents" type="IncidentView[]" description="Array of active (CONFIRMED) incidents" />
                            <ResponseField name="incidents[].id" type="string" description="Unique incident ID" />
                            <ResponseField name="incidents[].lineId" type="string" description="Affected rail line" />
                            <ResponseField name="incidents[].severity" type="string" description="traffic or emergency" />
                            <ResponseField name="incidents[].reason" type="string" description="Most common stall reason from reports" />
                            <ResponseField name="incidents[].nearestStationName" type="string" description="Station closest to the cluster" />
                            <ResponseField name="incidents[].uniqueDeviceCount" type="number" description="Number of unique reporters" />
                            <ResponseField name="incidents[].psa" type="string" description="Auto-generated PSA text for display" />
                            <ResponseField name="incidents[].confirmedAt" type="string" description="ISO timestamp when quorum was reached" />
                            <ResponseField name="incidents[].expiresAt" type="string" description="ISO timestamp when auto-expire triggers" />
                        </div>

                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Radio className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-emerald-400 font-bold">Realtime Integration</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                Incidents are broadcast on the <code className="text-xs text-zinc-300 font-mono">traintracks:incidents</code> Supabase
                                Realtime channel with events: <code className="text-xs text-zinc-300 font-mono">incident_confirmed</code>,{' '}
                                <code className="text-xs text-zinc-300 font-mono">incident_updated</code>,{' '}
                                <code className="text-xs text-zinc-300 font-mono">incident_resolved</code>.
                            </p>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• POST /incidents/resolve â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="incidents-resolve" title="POST /api/public/incidents/resolve">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Vote to resolve a confirmed incident. When &ge;3 unique devices vote to resolve, the incident
                            transitions to RESOLVED and a Realtime event is broadcast. <Badge color="bg-amber-500/10 text-amber-400">Token Required</Badge>
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Request Body (JSON)</div>
                            <Param name="incidentId" type="string" required description="The incident ID to vote on." />
                            <Param name="deviceId" type="string" required description="Anonymous device identifier (8-128 chars). Hashed server-side." />
                        </div>

                        <CopyBlock text={`curl -X POST \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "incidentId": "INC-abc123",
    "deviceId": "anon-device-abc123xy"
  }' \\
  "https://traintracks.vercel.app/api/public/incidents/resolve"`} />

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Response Fields</div>
                            <ResponseField name="ok" type="boolean" description="Whether the vote was accepted" />
                            <ResponseField name="message" type="string" description="Status message (e.g. 'Resolve vote recorded')" />
                            <ResponseField name="incident" type="IncidentView" description="Updated incident state" />
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• RESPONSE FORMAT â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="response-format" title="Response Format">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            All prediction endpoints return a <code className="text-xs text-zinc-300 font-mono">PredictionResponse</code> object.
                        </p>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mb-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Top-Level Fields</div>
                            <ResponseField name="generatedAt" type="string (ISO 8601)" description="When this response was generated" />
                            <ResponseField name="validUntil" type="string (ISO 8601)" description="When this response expires (25s after generation)" />
                            <ResponseField name="timezone" type="string" description="Always 'Asia/Manila'" />
                            <ResponseField name="dayType" type="string" description="Service day classification (see Service States)" />
                            <ResponseField name="serviceState" type="string" description="Current service state (see Service States)" />
                            <ResponseField name="sourceVersion" type="string" description="Engine version identifier" />
                            <ResponseField name="predictions" type="PredictedTrain[]" description="Array of predicted train objects" />
                            <ResponseField name="message" type="string?" description="Optional status message" />
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">PredictedTrain Fields</div>
                            <ResponseField name="id" type="string" description="Unique dispatch identifier" />
                            <ResponseField name="lineId" type="string" description="Line ID (LRT1, LRT2, MRT3)" />
                            <ResponseField name="direction" type="string" description="Direction of travel" />
                            <ResponseField name="lat / lng" type="number" description="Interpolated position (scope=map only)" />
                            <ResponseField name="speedKph" type="number" description="Estimated speed in km/h" />
                            <ResponseField name="statusCode" type="string" description="AT_STATION, LEAVING_STATION, IN_TRANSIT, APPROACHING_STATION" />
                            <ResponseField name="stationId / stationName" type="string" description="Current or next station" />
                            <ResponseField name="etaSeconds" type="number?" description="Seconds until arrival (scope=station)" />
                            <ResponseField name="etaWindowSeconds" type="number" description="Uncertainty window in seconds" />
                            <ResponseField name="arrivalTime" type="string?" description="Estimated arrival ISO timestamp" />
                            <ResponseField name="departureTime" type="string?" description="Estimated departure ISO timestamp" />
                            <ResponseField name="confidence" type="number" description="Confidence score (0.42, 0.62, or 0.82)" />
                            <ResponseField name="confidenceLevel" type="string" description="Human label: high, medium, low" />
                            <ResponseField name="predictionStatus" type="string" description="predicted_departing, predicted_between_stations, predicted_approaching, predicted_arriving" />
                            <ResponseField name="reasonCodes" type="string[]" description="Explanation codes for this prediction" />
                            <ResponseField name="validUntil" type="number" description="Unix timestamp (ms) when this prediction expires" />
                            <ResponseField name="source" type="string" description="Always 'predicted'" />
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• SERVICE STATES â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="service-states" title="Service States">
                        <div className="space-y-2">
                            {[
                                { state: 'active', desc: 'Trains are running. Predictions are available.', color: 'text-emerald-400 bg-emerald-500/10' },
                                { state: 'not_yet_started', desc: 'Before the first train departure for this direction.', color: 'text-amber-400 bg-amber-500/10' },
                                { state: 'service_closed', desc: 'After the last train. No predictions until next service day.', color: 'text-zinc-500 bg-zinc-800' },
                                { state: 'last_train_passed', desc: 'Final train for this station/direction has already passed.', color: 'text-zinc-500 bg-zinc-800' },
                                { state: 'service_suspended', desc: 'Service is suspended (maintenance, incident).', color: 'text-red-400 bg-red-500/10' },
                                { state: 'unavailable', desc: 'Line is not yet operational (e.g. MRT-7).', color: 'text-zinc-600 bg-zinc-900' },
                            ].map((s) => (
                                <div key={s.state} className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                                    <Badge color={s.color}>{s.state}</Badge>
                                    <span className="text-xs text-zinc-400">{s.desc}</span>
                                </div>
                            ))}
                        </div>

                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mt-4">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-3">Day Types</div>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    'weekday', 'monday_am_peak', 'friday_pm_peak', 'saturday',
                                    'sunday_or_regular_holiday', 'special_holiday', 'major_maintenance',
                                ].map((dt) => (
                                    <code key={dt} className="text-[10px] text-zinc-400 font-mono bg-zinc-800/50 px-2 py-1 rounded">{dt}</code>
                                ))}
                            </div>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• CONFIDENCE MODEL â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="confidence-model" title="Confidence Model">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Each prediction carries a confidence score based on historical schedule adherence. The score is a static lookup, not probabilistic.
                        </p>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                                <div className="text-2xl font-black text-emerald-400">82%</div>
                                <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">HIGH</div>
                                <div className="text-[9px] text-zinc-600 mt-2">Peak-hour MRT-3 & LRT-1</div>
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                                <div className="text-2xl font-black text-amber-400">62%</div>
                                <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">MEDIUM</div>
                                <div className="text-[9px] text-zinc-600 mt-2">Off-peak & weekends</div>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                                <div className="text-2xl font-black text-red-400">42%</div>
                                <div className="text-[9px] text-zinc-500 font-bold uppercase mt-1">LOW</div>
                                <div className="text-[9px] text-zinc-600 mt-2">LRT-2 & service edges</div>
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                <strong className="text-zinc-300">Edge penalty:</strong> Predictions within Â±12 minutes of service start or end are demoted one confidence tier (high â†’ medium â†’ low).
                            </p>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• SCHEDULES â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="schedules" title="Service Schedules">
                        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                            Operating hours vary by line, direction, and day type. All times are in Asia/Manila (UTC+8).
                        </p>

                        {[
                            {
                                line: 'LRT-1', color: 'border-emerald-500/20',
                                rows: [
                                    { dir: 'Southbound', wdFirst: '04:30', wdLast: '22:45', weFirst: '05:00', weLast: '21:45' },
                                    { dir: 'Northbound', wdFirst: '04:30', wdLast: '22:30', weFirst: '05:00', weLast: '21:30' },
                                ],
                            },
                            {
                                line: 'LRT-2', color: 'border-purple-500/20',
                                rows: [
                                    { dir: 'Eastbound', wdFirst: '05:00', wdLast: '21:30', weFirst: '05:00', weLast: '21:30' },
                                    { dir: 'Westbound', wdFirst: '05:00', wdLast: '21:00', weFirst: '05:00', weLast: '21:00' },
                                ],
                            },
                            {
                                line: 'MRT-3', color: 'border-yellow-500/20',
                                rows: [
                                    { dir: 'Southbound', wdFirst: '04:30', wdLast: '21:30', weFirst: '04:30', weLast: '21:30' },
                                    { dir: 'Northbound', wdFirst: '05:05', wdLast: '22:11', weFirst: '05:18', weLast: '22:09' },
                                ],
                            },
                        ].map((schedule) => (
                            <div key={schedule.line} className={`bg-zinc-900/50 border ${schedule.color} rounded-xl overflow-hidden mb-3`}>
                                <div className="px-4 py-2 border-b border-white/5 text-xs font-bold text-zinc-300">{schedule.line}</div>
                                <div className="px-4 py-2">
                                    <div className="grid grid-cols-5 gap-2 text-[9px] text-zinc-600 font-bold uppercase tracking-wider mb-2">
                                        <div>Direction</div>
                                        <div>WD First</div>
                                        <div>WD Last</div>
                                        <div>WE First</div>
                                        <div>WE Last</div>
                                    </div>
                                    {schedule.rows.map((row) => (
                                        <div key={row.dir} className="grid grid-cols-5 gap-2 text-[11px] font-mono py-1 border-t border-white/5">
                                            <div className="text-zinc-400">{row.dir}</div>
                                            <div className="text-zinc-300">{row.wdFirst}</div>
                                            <div className="text-zinc-300">{row.wdLast}</div>
                                            <div className="text-zinc-300">{row.weFirst}</div>
                                            <div className="text-zinc-300">{row.weLast}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• RATE LIMITS â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="rate-limits" title="Rate Limits">
                        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                There are currently <strong className="text-white">no enforced rate limits</strong> on the prediction API. However, please be respectful:
                            </p>
                            <ul className="mt-3 space-y-2">
                                <li className="text-xs text-zinc-400 flex items-start gap-2">
                                    <span className="text-emerald-400 mt-0.5">â€¢</span>
                                    Predictions are valid for 25 seconds â€” polling faster than that is wasteful.
                                </li>
                                <li className="text-xs text-zinc-400 flex items-start gap-2">
                                    <span className="text-emerald-400 mt-0.5">â€¢</span>
                                    Recommended polling interval: <strong className="text-white">10â€“30 seconds</strong> for live dashboards.
                                </li>
                                <li className="text-xs text-zinc-400 flex items-start gap-2">
                                    <span className="text-emerald-400 mt-0.5">â€¢</span>
                                    For real-time train presence, subscribe to the Supabase Realtime channel instead of polling.
                                </li>
                            </ul>
                        </div>
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• ERRORS â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="errors" title="Error Handling">
                        <div className="space-y-2">
                            {[
                                { code: '200', desc: 'Success. Response contains predictions.', color: 'text-emerald-400' },
                                { code: '400', desc: 'Bad request. Invalid parameters.', color: 'text-amber-400' },
                                { code: '401', desc: 'Unauthorized. Missing or invalid API token (public API only).', color: 'text-red-400' },
                                { code: '503', desc: 'Service unavailable. API tokens not configured on server.', color: 'text-red-400' },
                            ].map((err) => (
                                <div key={err.code} className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                                    <code className={`text-sm font-mono font-bold ${err.color}`}>{err.code}</code>
                                    <span className="text-xs text-zinc-400">{err.desc}</span>
                                </div>
                            ))}
                        </div>

                        <CopyBlock language="json" text={`// 401 Unauthorized
{
  "error": "invalid_api_token",
  "message": "The supplied prediction API token is invalid."
}

// 503 Service Unavailable
{
  "error": "api_tokens_not_configured",
  "message": "Public prediction API tokens are not configured."
}`} />
                    </DocSection>

                    {/* â•â•â•â•â•â•â•â•â•â• EXAMPLES â•â•â•â•â•â•â•â•â•â• */}
                    <DocSection id="examples" title="Examples">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                                    Get live MRT-3 train positions
                                </h3>
                                <CopyBlock text={`curl -s "https://traintracks.vercel.app/api/predictions?lineId=MRT3&scope=map&limit=10" | jq .`} />
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <Train className="w-3.5 h-3.5 text-zinc-500" />
                                    Get next 3 northbound arrivals at Ayala station
                                </h3>
                                <CopyBlock text={`curl -s "https://traintracks.vercel.app/api/predictions?lineId=MRT3&stationId=M3-11&direction=NORTHBOUND&scope=station&limit=3" | jq .`} />
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <Radio className="w-3.5 h-3.5 text-zinc-500" />
                                    Submit crowd presence (authenticated user on train)
                                </h3>
                                <CopyBlock language="json" text={`// POST /api/crowd/presence
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "lineId": "LRT1",
  "direction": "SOUTHBOUND",
  "lat": 14.5353,
  "lng": 120.9822,
  "statusCode": "IN_TRANSIT",
  "stationId": "L1-13",
  "speedKph": 42,
  "confidence": 0.78
}`} />
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                                    Poll all lines every 10 seconds (bash)
                                </h3>
                                <CopyBlock text={`#!/bin/bash
while true; do
  echo "$(date +%H:%M:%S) | $(
    curl -s 'https://traintracks.vercel.app/api/predictions?scope=map&lineId=LRT1&limit=20' | jq -r '.predictions | length'
  ) LRT1 | $(
    curl -s 'https://traintracks.vercel.app/api/predictions?scope=map&lineId=LRT2&limit=20' | jq -r '.predictions | length'
  ) LRT2 | $(
    curl -s 'https://traintracks.vercel.app/api/predictions?scope=map&lineId=MRT3&limit=20' | jq -r '.predictions | length'
  ) MRT3"
  sleep 10
done`} />
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5 text-zinc-500" />
                                    JavaScript fetch (browser / Node.js)
                                </h3>
                                <CopyBlock language="javascript" text={`const response = await fetch(
  'https://traintracks.vercel.app/api/public/predictions?lineId=MRT3&scope=map',
  {
    headers: {
      'Authorization': 'Bearer YOUR_API_TOKEN',
    },
  }
);

const data = await response.json();
console.log(\`Service: \${data.serviceState}\`);
console.log(\`Trains: \${data.predictions.length}\`);

for (const train of data.predictions) {
  console.log(
    \`  \${train.id} | \${train.direction} | \${train.stationName} | \` +
    \`\${train.statusCode} | \${(train.confidence * 100).toFixed(0)}% conf\`
  );
}`} />
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5 text-zinc-500" />
                                    Python requests
                                </h3>
                                <CopyBlock language="python" text={`import requests

response = requests.get(
    "https://traintracks.vercel.app/api/public/predictions",
    params={"lineId": "MRT3", "scope": "map", "limit": 10},
    headers={"Authorization": "Bearer YOUR_API_TOKEN"},
)

data = response.json()
print(f"Service: {data['serviceState']}")
print(f"Day type: {data['dayType']}")

for train in data["predictions"]:
    print(
        f"  {train['id']} | {train['direction']} | "
        f"{train['stationName']} | {train['statusCode']} | "
        f"{train['confidence']:.0%} conf"
    )`} />
                            </div>
                        </div>
                    </DocSection>

                </main>
            </div>

            <style jsx>{`
                @keyframes apiFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .docs-scroll-container::-webkit-scrollbar { display: none; }
                .docs-scroll-container { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
