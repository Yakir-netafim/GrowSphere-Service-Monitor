import { NextResponse } from 'next/server';
import { services } from '@/app/config/services';
import { kv } from '@vercel/kv';
import { sendEmailAlert, sendTeamsAlert } from '@/lib/notifications';
import { CheckResult } from '@/app/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {

    const checks: Array<() => Promise<CheckResult>> = [];

    for (const service of services) {
        for (const env of service.environments) {
            checks.push(async () => {
                const start = Date.now();
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000);

                    const res = await fetch(env.url, {
                        signal: controller.signal,
                        cache: 'no-store',
                    });
                    clearTimeout(timeoutId);

                    return {
                        serviceName: service.name,
                        envName: env.name,
                        url: env.url,
                        status: res.ok ? 'UP' : 'DOWN',
                        statusCode: res.status,
                        duration: Date.now() - start,
                        timestamp: new Date().toISOString(),
                    } as CheckResult;
                } catch {
                    return {
                        serviceName: service.name,
                        envName: env.name,
                        url: env.url,
                        status: 'DOWN',
                        statusCode: 0,
                        duration: Date.now() - start,
                        timestamp: new Date().toISOString(),
                    } as CheckResult;
                }
            });
        }
    }

    const allResults = await Promise.all(checks.map((fn) => fn()));

    const today = new Date().toISOString().split('T')[0];
    const downServices: CheckResult[] = [];

    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

    // Group results by service
    const serviceGroups = allResults.reduce((acc, result) => {
        if (!acc[result.serviceName]) acc[result.serviceName] = [];
        acc[result.serviceName].push(result);
        return acc;
    }, {} as Record<string, CheckResult[]>);

    for (const serviceName in serviceGroups) {
        const results = serviceGroups[serviceName];
        const downInCurrentRun = results.filter(r => r.status === 'DOWN');

        if (downInCurrentRun.length > 0) {
            const newFailingEnvs: typeof downInCurrentRun = [];

            for (const result of downInCurrentRun) {
                downServices.push(result);
                const redisKey = `alert:${result.serviceName}:${result.envName}:${today}`;

                try {
                    let alreadySent = false;
                    if (hasKV) {
                        alreadySent = await kv.get(redisKey) === 'true';
                    }

                    if (!alreadySent) {
                        newFailingEnvs.push(result);
                        if (hasKV) {
                            await kv.set(redisKey, 'true', { ex: 86400 });
                        }
                    } else {
                        console.log(`ℹ️ Skipping alert for ${result.serviceName} (${result.envName}) — already sent today.`);
                    }
                } catch (kvError) {
                    console.error(`KV error for ${result.serviceName} (${result.envName}):`, kvError);
                }
            }

            if (newFailingEnvs.length > 0) {
                console.log(`🚀 Sending grouped Teams alert for ${serviceName} (${newFailingEnvs.length} new envs)`);
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
    }

    // Save last-check timestamp
    if (hasKV) {
        try {
            await kv.set('last_check', new Date().toISOString());
        } catch (kvError) {
            console.error('Failed to save last_check timestamp:', kvError);
        }
    } else {
        console.warn('⚠️ KV not configured, last_check timestamp not saved.');
    }

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
