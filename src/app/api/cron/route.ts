import { NextResponse } from 'next/server';
import { services } from '@/app/config/services';
import { kv } from '@vercel/kv';
import { sendTeamsAlert, sendTeamsRecoveryAlert } from '@/lib/notifications';
import { CheckResult } from '@/app/types';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Ignore SSL certificate errors for internal Kubernetes APIs

export const dynamic = 'force-dynamic';
// Increased to 300s to accommodate the 30-second in-run retry delay
export const maxDuration = 300;

// ─── Helper: single endpoint check ───────────────────────────────────────────
async function checkEndpoint(url: string): Promise<{ isUp: boolean; statusCode: number; duration: number }> {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'StatusMonitor/1.0 (Vercel Cron)'
            }
        });
        clearTimeout(timeoutId);

        let isUp = res.ok;
        try {
            const json = await res.json();
            if (json?.status === 'Healthy') isUp = true;
            else if (json?.status === 'Unhealthy' || json?.status === 'Degraded') isUp = false;
        } catch {
            // Not JSON — rely on HTTP status only
        }

        return { isUp, statusCode: res.status, duration: Date.now() - start };
    } catch {
        return { isUp: false, statusCode: 0, duration: Date.now() - start };
    }
}

// Helper to run promises in chunks to prevent Rate Limiting / 503 throttling on K8s Ingress
async function runInChunks<T, R>(items: T[], chunkSize: number, asyncFn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(asyncFn));
        results.push(...chunkResults);
        // Delay slightly between chunks
        if (i + chunkSize < items.length) {
            await sleep(200);
        }
    }
    return results;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Main cron handler ────────────────────────────────────────────────────────
export async function GET(request: Request) {
    const startOverall = Date.now();
    const url = new URL(request.url);

    // 1. Authentication — support both Vercel (Authorization header) and GitHub Actions (token param)
    const token = url.searchParams.get('token');
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const secret = process.env.CRON_SECRET;

    if (secret && token !== secret && bearerToken !== secret) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const source = url.searchParams.get('source') || 'manual';
    console.log(`🚀 Cron triggered from: ${source}`);

    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    // 2. Prevent overlapping runs (Deduplication)
    if (hasKV) {
        try {
            const lastRunStr = await kv.get<string>('last-health-check-run');
            if (lastRunStr) {
                const lastRunTime = parseInt(lastRunStr, 10);
                if (Date.now() - lastRunTime < 8 * 60 * 1000) {
                    console.log('⏭️ Skipping duplicate cron run (ran recently)');
                    return NextResponse.json({ message: 'Skipped duplicate run' });
                }
            }
            await kv.set('last-health-check-run', Date.now().toString(), { ex: 600 });
        } catch (e) {
            console.error('KV duplicate check failed:', e);
        }
    }

    // 3. First-pass: check all endpoints in parallel
    const checksInput = services.flatMap((s) =>
        s.environments.map((e) => ({ serviceId: s.id, serviceName: s.name, envName: e.name, url: e.url }))
    );

    console.log(`🔍 Pass 1: checking ${checksInput.length} endpoints...`);

    const pass1Results: CheckResult[] = await runInChunks(checksInput, 5, async (c) => {
        const { isUp, statusCode, duration } = await checkEndpoint(c.url);
        return {
            serviceName: c.serviceName,
            envName: c.envName,
            url: c.url,
            status: isUp ? 'UP' : 'DOWN',
            statusCode,
            duration,
            timestamp: new Date().toISOString(),
        } as CheckResult;
    });

    // 4. In-run retry: re-check ONLY the DOWN endpoints after 30 seconds
    //    This eliminates transient blips (network hiccups, brief restarts) within the same run.
    const firstPassDown = pass1Results.filter(r => r.status === 'DOWN');
    let allResults: CheckResult[] = [...pass1Results.filter(r => r.status === 'UP')];

    if (firstPassDown.length > 0) {
        console.log(`⏳ ${firstPassDown.length} endpoint(s) DOWN in pass 1 — waiting 30s before retry...`);
        await sleep(30_000);

        console.log(`🔍 Pass 2 (retry): re-checking ${firstPassDown.length} failed endpoint(s)...`);
        const pass2Results: CheckResult[] = await runInChunks(firstPassDown, 5, async (c) => {
            const { isUp, statusCode, duration } = await checkEndpoint(c.url);
            if (isUp) {
                console.log(`✅ ${c.serviceName} [${c.envName}] recovered on retry — ignoring (transient blip)`);
            } else {
                console.log(`❌ ${c.serviceName} [${c.envName}] still DOWN after retry`);
            }
            return {
                ...c,
                status: isUp ? 'UP' : 'DOWN',
                statusCode,
                duration,
                timestamp: new Date().toISOString(),
            } as CheckResult;
        });
        allResults = [...allResults, ...pass2Results];
    }

    // 5. Alerting Logic (Failures + Recoveries)
    //    Uses a double-confirmation pattern across cron runs:
    //      Run 1: Service DOWN after retry → save as "pending" in KV, no alert yet
    //      Run 2: Service still DOWN after retry → confirmed! send Teams alert
    //      Recovery while pending → clear pending, no alert (false alarm)
    //
    //    Combined with the in-run retry, this means 3 independent checks are
    //    required before any alert fires.
    const serviceGroups = allResults.reduce((acc, result) => {
        if (!acc[result.serviceName]) acc[result.serviceName] = [];
        acc[result.serviceName].push(result);
        return acc;
    }, {} as Record<string, CheckResult[]>);

    const downServices: CheckResult[] = [];

    for (const serviceName in serviceGroups) {
        const results = serviceGroups[serviceName];
        const downEnvs = results.filter(r => r.status === 'DOWN');
        const upEnvs   = results.filter(r => r.status === 'UP');

        // ── Handle DOWN environments ──────────────────────────────────────────
        if (downEnvs.length > 0) {
            const confirmedFailingEnvs: typeof downEnvs = [];

            for (const result of downEnvs) {
                downServices.push(result);
                const alertKey   = `alert:down:${result.serviceName}:${result.envName}`;
                const pendingKey = `alert:pending:${result.serviceName}:${result.envName}`;

                try {
                    if (!hasKV) {
                        // No KV available — fall back to immediate alert
                        confirmedFailingEnvs.push(result);
                        continue;
                    }

                    const alreadyAlerted = await kv.get(alertKey) === 'true';
                    if (alreadyAlerted) {
                        console.log(`⏭️ Already alerted: ${result.serviceName} [${result.envName}]`);
                        continue;
                    }

                    const isPending = await kv.get(pendingKey) === 'true';
                    if (isPending) {
                        // 2nd consecutive cron run still DOWN → send alert
                        console.log(`🔴 Confirmed DOWN across 2 runs: ${result.serviceName} [${result.envName}]`);
                        confirmedFailingEnvs.push(result);
                        await kv.del(pendingKey);
                        await kv.set(alertKey, 'true', { ex: 86400 }); // Re-alert after 24 h
                    } else {
                        // 1st cron run DOWN → mark pending, wait for next run
                        console.log(`⏳ 1st confirmation: ${result.serviceName} [${result.envName}] — queued for next run`);
                        await kv.set(pendingKey, 'true', { ex: 1800 }); // Expires in 30 min
                    }
                } catch (kvError) {
                    console.error(`KV error for ${result.serviceName}:`, kvError);
                    confirmedFailingEnvs.push(result); // Fallback: alert immediately
                }
            }

            if (confirmedFailingEnvs.length > 0) {
                console.log(`🚨 Sending Teams alert for ${serviceName} (confirmed across 3 checks)`);
                await sendTeamsAlert({
                    serviceName,
                    failingEnvs: confirmedFailingEnvs.map(e => ({
                        envName: e.envName,
                        url: e.url,
                        statusCode: e.statusCode,
                    })),
                });
            }
        }

        // ── Handle RECOVERED / false-alarm environments ───────────────────────
        if (upEnvs.length > 0) {
            const newlyRecoveredEnvs: typeof upEnvs = [];

            for (const result of upEnvs) {
                const alertKey   = `alert:down:${result.serviceName}:${result.envName}`;
                const pendingKey = `alert:pending:${result.serviceName}:${result.envName}`;

                try {
                    if (hasKV) {
                        const wasPending = await kv.get(pendingKey) === 'true';
                        if (wasPending) {
                            console.log(`🔕 False alarm cleared: ${result.serviceName} [${result.envName}]`);
                            await kv.del(pendingKey);
                        }

                        const wasDown = await kv.get(alertKey) === 'true';
                        if (wasDown) {
                            newlyRecoveredEnvs.push(result);
                            await kv.del(alertKey);
                        }
                    }
                } catch (kvError) {
                    console.error(`KV recovery error for ${result.serviceName}:`, kvError);
                }
            }

            if (newlyRecoveredEnvs.length > 0) {
                console.log(`💚 Sending RECOVERY alert for ${serviceName}`);
                await sendTeamsRecoveryAlert({
                    serviceName,
                    recoveredEnvs: newlyRecoveredEnvs.map(e => ({
                        envName: e.envName,
                        url: e.url,
                    })),
                });
            }
        }
    }

    // Save last-check timestamp
    if (hasKV) {
        try {
            await kv.set('last_check', new Date().toISOString());
        } catch (e) {
            console.error('Failed to save last_check timestamp:', e);
        }
    }

    const elapsed = Date.now() - startOverall;
    console.log(`⏱️ Cron finished in ${elapsed}ms`);

    return NextResponse.json({
        summary: `Checked ${allResults.length} endpoints`,
        up: allResults.filter(r => r.status === 'UP').length,
        down: downServices.length,
        downServices: downServices.map(r => ({
            service: r.serviceName,
            env: r.envName,
            statusCode: r.statusCode,
        })),
        timestamp: new Date().toISOString(),
        elapsed: `${elapsed}ms`,
    });
}
