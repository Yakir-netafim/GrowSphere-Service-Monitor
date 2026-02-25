'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Activity, RefreshCw, Filter, RotateCcw } from 'lucide-react';
import { ServiceConfig } from '@/app/types';
import clsx from 'clsx';

type EnvName = 'Dev1' | 'Dev2' | 'QA1' | 'STAG' | 'PROD';

interface ServiceResult {
    serviceId: string;
    serviceName: string;
    env: string;
    url: string;
    isUp: boolean;
    statusCode: number;
    duration: number;
}

interface Props {
    services: ServiceConfig[];
    results: ServiceResult[];
    lastCheck: string | null;
}

const ENV_STYLES: Record<string, { badge: string }> = {
    Dev1: { badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    Dev2: { badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    QA1: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    STAG: { badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    PROD: { badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
};

const ALL_ENVS: EnvName[] = ['Dev1', 'Dev2', 'QA1', 'STAG', 'PROD'];

// Auto-refresh the page data every 60 seconds
const REFRESH_INTERVAL_SECONDS = 60;

export default function DashboardClient({ services, results, lastCheck }: Props) {
    const router = useRouter();
    const [selectedEnv, setSelectedEnv] = useState<EnvName | 'ALL'>('ALL');
    const [showOnlyDown, setShowOnlyDown] = useState(false);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SECONDS);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date().toISOString());
    const [currentTime, setCurrentTime] = useState(() => new Date());

    // Sync lastUpdatedAt when results change
    useEffect(() => {
        setLastUpdatedAt(new Date().toISOString());
        setIsRefreshing(false);
    }, [results]);

    // Live clock and countdown tick
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
            setCountdown((prev) => {
                if (prev <= 1) return REFRESH_INTERVAL_SECONDS;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const doRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setCountdown(REFRESH_INTERVAL_SECONDS);
    };

    // Trigger refresh when countdown hits 0 (wraps back to REFRESH_INTERVAL_SECONDS)
    useEffect(() => {
        if (countdown === REFRESH_INTERVAL_SECONDS) {
            router.refresh();
            setIsRefreshing(true);
        }
    }, [countdown, router]);

    // Derive filtered data and sort (DOWN services first)
    const filteredServices = useMemo(() => {
        const processed = services
            .map((service) => {
                const filteredEnvs = service.environments.filter((env) => {
                    if (selectedEnv !== 'ALL' && env.name !== selectedEnv) return false;
                    if (showOnlyDown) {
                        const result = results.find((r) => r.serviceId === service.id && r.env === env.name);
                        if (result?.isUp) return false;
                    }
                    return true;
                });
                return { ...service, environments: filteredEnvs };
            })
            .filter((service) => service.environments.length > 0);

        // Sort: Services with any DOWN environment in current view come first
        return [...processed].sort((a, b) => {
            const aResults = results.filter(r => r.serviceId === a.id && a.environments.some(e => e.name === r.env));
            const bResults = results.filter(r => r.serviceId === b.id && b.environments.some(e => e.name === r.env));

            const aUp = aResults.every(r => r.isUp);
            const bUp = bResults.every(r => r.isUp);

            if (aUp === bUp) return 0; // Keep order if both same
            return aUp ? 1 : -1; // If a is UP and b is DOWN, b comes first
        });
    }, [services, results, selectedEnv, showOnlyDown]);

    const totalUp = results.filter((r) => r.isUp).length;
    const totalDown = results.filter((r) => !r.isUp).length;
    const overallHealthy = totalDown === 0;

    const cronLastCheckFormatted = lastCheck
        ? new Date(lastCheck).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
        ' · ' + new Date(lastCheck).toLocaleDateString('en-GB')
        : 'Not yet checked by Cron';

    const lastUpdatedFormatted = new Date(lastUpdatedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    const currentTimeFormatted = currentTime.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    return (
        <main className="min-h-screen bg-slate-950 text-white">
            {/* Header */}
            <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <Activity className="w-7 h-7 text-blue-400" />
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Netafim Service Monitor</h1>
                            <p className="text-xs text-slate-400">GrowSphere Microservices Health Dashboard</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Overall status badge */}
                        <div
                            className={clsx(
                                'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold',
                                overallHealthy
                                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                            )}
                        >
                            <span className={clsx('w-2 h-2 rounded-full animate-pulse', overallHealthy ? 'bg-green-400' : 'bg-red-400')} />
                            {overallHealthy ? 'All Systems Operational' : `${totalDown} Service${totalDown > 1 ? 's' : ''} Down`}
                        </div>

                        {/* Live refresh counter + manual refresh button */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={doRefresh}
                                title="Refresh now"
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-400 transition-colors"
                            >
                                <RefreshCw className={clsx('w-3.5 h-3.5', isRefreshing && 'animate-spin text-blue-400')} />
                                <span className="tabular-nums">
                                    {isRefreshing ? 'Refreshing…' : `Auto-refresh in ${countdown}s`}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Timestamp bar */}
                <div className="border-t border-slate-800/60 bg-slate-900/30">
                    <div className="max-w-7xl mx-auto px-6 py-1.5 flex items-center gap-6 text-xs text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1.5">
                            <RotateCcw className="w-3 h-3" />
                            <span>Last updated: <span className="text-slate-400">{lastUpdatedFormatted}</span></span>
                        </span>
                        <span className="flex items-center gap-1.5 border-l border-slate-800 pl-6">
                            <Activity className="w-3 h-3 text-blue-500" />
                            <span>Live time: <span className="text-blue-400 font-mono">{currentTimeFormatted}</span></span>
                        </span>
                        <span className="flex items-center gap-1.5 border-l border-slate-800 pl-6">
                            <RefreshCw className="w-3 h-3" />
                            <span>Last Cron run: <span className="text-slate-400">{cronLastCheckFormatted}</span></span>
                        </span>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
                        <div className="text-3xl font-bold text-white">{results.length}</div>
                        <div className="text-sm text-slate-400 mt-1">Total Endpoints</div>
                    </div>
                    <div className="bg-slate-900 border border-green-500/20 rounded-xl p-5 text-center">
                        <div className="text-3xl font-bold text-green-400">{totalUp}</div>
                        <div className="text-sm text-slate-400 mt-1">Healthy</div>
                    </div>
                    <div className="bg-slate-900 border border-red-500/20 rounded-xl p-5 text-center">
                        <div className="text-3xl font-bold text-red-400">{totalDown}</div>
                        <div className="text-sm text-slate-400 mt-1">Down</div>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => setSelectedEnv('ALL')}
                            className={clsx(
                                'px-3 py-1.5 rounded text-xs font-bold transition-all',
                                selectedEnv === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                            )}
                        >
                            All Envs
                        </button>
                        {ALL_ENVS.map((env) => (
                            <button
                                key={env}
                                onClick={() => setSelectedEnv(env)}
                                className={clsx(
                                    'px-3 py-1.5 rounded text-xs font-bold transition-all border',
                                    selectedEnv === env
                                        ? ENV_STYLES[env]?.badge + ' shadow'
                                        : 'text-slate-400 border-transparent hover:text-white'
                                )}
                            >
                                {env}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowOnlyDown((v) => !v)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-all',
                            showOnlyDown
                                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                        )}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        {showOnlyDown ? 'Showing: DOWN only' : 'Show only DOWN'}
                    </button>

                    {(selectedEnv !== 'ALL' || showOnlyDown) && (
                        <button
                            onClick={() => { setSelectedEnv('ALL'); setShowOnlyDown(false); }}
                            className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Services Grid */}
                {filteredServices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-600">
                        <CheckCircle className="w-16 h-16 mb-4 text-green-700/40" />
                        <p className="text-lg font-medium">No services match current filters</p>
                        <p className="text-sm mt-1">
                            {showOnlyDown ? 'All monitored services are healthy! 🎉' : 'Try changing your filter.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filteredServices.map((service) => {
                            const serviceResults = results.filter((r) => r.serviceId === service.id);
                            const visibleResults = serviceResults.filter((r) =>
                                service.environments.some((e) => e.name === r.env)
                            );
                            const serviceUp = visibleResults.every((r) => r.isUp);

                            return (
                                <div
                                    key={service.id}
                                    className={clsx(
                                        'bg-slate-900 rounded-xl border p-5 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50',
                                        serviceUp ? 'border-slate-800' : 'border-red-500/30'
                                    )}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2.5">
                                            <span
                                                className={clsx(
                                                    'w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse',
                                                    serviceUp ? 'bg-green-400' : 'bg-red-400'
                                                )}
                                            />
                                            <h2 className="font-semibold text-slate-100 leading-tight">{service.name}</h2>
                                        </div>
                                        <span
                                            className={clsx(
                                                'text-xs px-2 py-0.5 rounded font-medium flex-shrink-0',
                                                serviceUp ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                            )}
                                        >
                                            {serviceUp ? 'OK' : 'ISSUE'}
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        {service.environments.map((env) => {
                                            const result = results.find((r) => r.serviceId === service.id && r.env === env.name);
                                            const isUp = result?.isUp ?? false;
                                            const envStyle = ENV_STYLES[env.name] ?? ENV_STYLES.Dev1;

                                            return (
                                                <div key={env.name} className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                                                        {/* Left: env badge + truncated URL link */}
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded border flex-shrink-0', envStyle.badge)}>
                                                                {env.name}
                                                            </span>
                                                            <a
                                                                href={env.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-slate-600 hover:text-blue-400 transition-colors truncate max-w-[140px]"
                                                                title={env.url}
                                                            >
                                                                {env.url.replace('https://', '')}
                                                            </a>
                                                        </div>

                                                        {/* Right: duration + status */}
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            {result?.duration !== undefined && (
                                                                <span className="text-xs text-slate-600">{result.duration}ms</span>
                                                            )}
                                                            {isUp ? (
                                                                <span className="flex items-center gap-1 text-green-400 text-xs font-bold">
                                                                    <CheckCircle className="w-3.5 h-3.5" /> UP
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
                                                                    <XCircle className="w-3.5 h-3.5" />
                                                                    {result?.statusCode === 0 ? 'TIMEOUT' : `${result?.statusCode ?? 'ERR'}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Full URL shown below when DOWN */}
                                                    {!isUp && (
                                                        <a
                                                            href={env.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-red-400/70 hover:text-red-300 break-all pl-3 transition-colors"
                                                        >
                                                            🔗 {env.url}
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <footer className="mt-12 text-center text-xs text-slate-600 border-t border-slate-800 pt-6">
                    Netafim GrowSphere — Service Health Monitor · Alerts sent to yakir.moshe@netafim.com · Cron runs hourly
                </footer>
            </div>
        </main>
    );
}
