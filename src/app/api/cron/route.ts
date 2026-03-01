import { NextResponse } from 'next/server';
import { services } from '@/app/config/services';
import { kv } from '@vercel/kv';
import { sendTeamsAlert, sendTeamsRecoveryAlert } from '@/lib/notifications';
import { CheckResult } from '@/app/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const startOverall = Date.now();
    const url = new URL(request.url);

    // 1. Authentication - support both Vercel (Authorization header) and GitHub Actions (token param)
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
                // If last run was less than 8 minutes ago, skip this run
                if (Date.now() - lastRunTime < 8 * 60 * 1000) {
                    console.log('⏭️ Skipping duplicate cron run (ran recently)');
                    return NextResponse.json({ message: 'Skipped duplicate run' });
                }
            }
            await kv.set('last-health-check-run', Date.now().toString(), { ex: 600 }); // Expire after 10 mins
        } catch (e) {
            console.error('KV duplicate check failed:', e);
        }
    }

    // 3. Parallel fetching
    const checksInput = services.flatMap((s) =>
        s.environments.map((e) => ({ serviceId: s.id, serviceName: s.name, envName: e.name, url: e.url }))
    );

    const checkPromises = checksInput.map(async (c) => {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(c.url, {
                signal: controller.signal,
                cache: 'no-store',
            });
            clearTimeout(timeoutId);

            let isUp = res.ok;
            try {
                const json = await res.json();
                if (json?.status === 'Healthy') isUp = true;
                else if (json?.status === 'Unhealthy' || json?.status === 'Degraded') isUp = false;
            } catch {
                // Not JSON
            }

            return {
                serviceName: c.serviceName,
                envName: c.envName,
                url: c.url,
                status: isUp ? 'UP' : 'DOWN',
                statusCode: res.status,
                duration: Date.now() - start,
                timestamp: new Date().toISOString(),
            } as CheckResult;
        } catch {
            return {
                serviceName: c.serviceName,
                envName: c.envName,
                url: c.url,
                status: 'DOWN',
                statusCode: 0,
                duration: Date.now() - start,
                timestamp: new Date().toISOString(),
            } as CheckResult;
        }
    });

    const resultsRaw = await Promise.allSettled(checkPromises);
    const allResults = resultsRaw
        .filter((r): r is PromiseFulfilledResult<CheckResult> => r.status === 'fulfilled')
        .map(r => r.value);

    // 4. Alerting Logic (Failures + Recoveries)
    const serviceGroups = allResults.reduce((acc, result) => {
        if (!acc[result.serviceName]) acc[result.serviceName] = [];
        acc[result.serviceName].push(result);
        return acc;
    }, {} as Record<string, CheckResult[]>);

    const downServices: CheckResult[] = [];

    for (const serviceName in serviceGroups) {
        const results = serviceGroups[serviceName];
        const downEnvs = results.filter(r => r.status === 'DOWN');
        const upEnvs = results.filter(r => r.status === 'UP');

        // Handle DOWN environments
        if (downEnvs.length > 0) {
            const newFailingEnvs: typeof downEnvs = [];

            for (const result of downEnvs) {
                downServices.push(result);
                const redisKey = `alert:down:${result.serviceName}:${result.envName}`;

                try {
                    let alreadySent = false;
                    if (hasKV) {
                        alreadySent = await kv.get(redisKey) === 'true';
                    }

                    if (!alreadySent) {
                        newFailingEnvs.push(result);
                        if (hasKV) {
                            // Expire tomorrow to re-alert if still down
                            await kv.set(redisKey, 'true', { ex: 86400 });
                        }
                    }
                } catch (kvError) {
                    console.error(`KV error for down alert ${result.serviceName}:`, kvError);
                }
            }

            if (newFailingEnvs.length > 0) {
                console.log(`🚀 Sending new DOWN alert for ${serviceName}`);
                await sendTeamsAlert({
                    serviceName,
                    failingEnvs: newFailingEnvs.map(e => ({
                        envName: e.envName,
                        url: e.url,
                        statusCode: e.statusCode
                    }))
                });
            }
        }

        // Handle RECOVERED environments
        if (upEnvs.length > 0) {
            const newlyRecoveredEnvs: typeof upEnvs = [];

            for (const result of upEnvs) {
                const redisKey = `alert:down:${result.serviceName}:${result.envName}`;

                try {
                    if (hasKV) {
                        const wasDown = await kv.get(redisKey) === 'true';
                        if (wasDown) {
                            newlyRecoveredEnvs.push(result);
                            await kv.del(redisKey); // Clear the DOWN state
                        }
                    }
                } catch (kvError) {
                    console.error(`KV error for recovery alert ${result.serviceName}:`, kvError);
                }
            }

            if (newlyRecoveredEnvs.length > 0) {
                console.log(`✅ Sending RECOVERY alert for ${serviceName}`);
                await sendTeamsRecoveryAlert({
                    serviceName,
                    recoveredEnvs: newlyRecoveredEnvs.map(e => ({
                        envName: e.envName,
                        url: e.url
                    }))
                });
            }
        }
    }

    // Save general last-check timestamp
    if (hasKV) {
        try {
            await kv.set('last_check', new Date().toISOString());
        } catch (e) {
            console.error('Failed to save last_check timestamp:', e);
        }
    }

    console.log(`⏱️ Cron finished in ${Date.now() - startOverall}ms`);

    return NextResponse.json({
        summary: `Checked ${allResults.length} endpoints`,
        up: allResults.filter((r) => r.status === 'UP').length,
        down: downServices.length,
        downServices: downServices.map((r) => ({
            service: r.serviceName,
            env: r.envName,
            statusCode: r.statusCode,
        })),
        timestamp: new Date().toISOString(),
    });
}
