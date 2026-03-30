import { services } from '@/app/config/services';
import DashboardClient from '@/app/components/DashboardClient';
import { kv } from '@vercel/kv';

export const dynamic = 'force-dynamic';

async function checkService(url: string): Promise<{ isUp: boolean; statusCode: number; duration: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'StatusMonitor/1.0 (Vercel Node.js)'
      }
    });
    clearTimeout(timeoutId);
    // Try to parse JSON body — .NET health endpoints sometimes return 503
    // even when the body says {"status":"Healthy"}
    try {
      const json = await res.json();
      if (json?.status === 'Healthy') {
        return { isUp: true, statusCode: res.status, duration: Date.now() - start };
      }
      if (json?.status === 'Unhealthy' || json?.status === 'Degraded') {
        return { isUp: false, statusCode: res.status, duration: Date.now() - start };
      }
    } catch {
      // Not JSON — fall through to HTTP status
    }
    return { isUp: res.ok, statusCode: res.status, duration: Date.now() - start };
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
    // Add a tiny 200ms delay between chunks to help WAFs digest
    if (i + chunkSize < items.length) {
      await new Promise((res) => setTimeout(res, 200));
    }
  }
  return results;
}

export default async function Dashboard() {
  const checksInput = services.flatMap((s) =>
    s.environments.map((e) => ({ serviceId: s.id, serviceName: s.name, env: e.name, url: e.url }))
  );

  // KV is only available in production (Vercel). Fall back to null locally.
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  // Run health checks in chunks of 5 and fetch last cron timestamp in parallel
  const [results, lastCheck] = await Promise.all([
    runInChunks(checksInput, 5, async (c) => ({
      ...c,
      ...(await checkService(c.url)),
    })),
    hasKV ? kv.get<string>('last_check').catch(() => null) : Promise.resolve(null),
  ]);

  return <DashboardClient services={services} results={results} lastCheck={lastCheck} />;
}
