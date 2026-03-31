import { services } from '@/app/config/services';
import DashboardClient from '@/app/components/DashboardClient';
import { kv } from '@vercel/kv';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // Ensure no caching

async function checkService(url: string, retryCount = 0): Promise<{ isUp: boolean; statusCode: number; duration: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for dashboard checks

    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'StatusMonitor/1.0 (Vercel Node.js Dashboard)'
      }
    });

    clearTimeout(timeoutId);

    // Try to parse JSON body
    try {
      const json = await res.json();
      if (json?.status === 'Healthy') {
        return { isUp: true, statusCode: res.status, duration: Date.now() - start };
      }
      if (json?.status === 'Unhealthy' || json?.status === 'Degraded') {
        return { isUp: false, statusCode: res.status, duration: Date.now() - start };
      }
    } catch {
      // Not JSON
    }

    if (res.ok) {
      return { isUp: true, statusCode: res.status, duration: Date.now() - start };
    }

    // If not OK and it's some generic error, maybe retry once
    if (retryCount === 0 && (res.status >= 500 || res.status === 429)) {
       await new Promise(resolve => setTimeout(resolve, 500));
       return checkService(url, 1);
    }

    return { isUp: false, statusCode: res.status, duration: Date.now() - start };
  } catch (err: any) {
    // If it's a real timeout or network reset, retry once immediately
    if (retryCount === 0) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return checkService(url, 1);
    }

    const duration = Date.now() - start;
    let errorMsg = 'TIMEOUT';
    if (err.name === 'AbortError') errorMsg = 'TIMEOUT';
    else if (err.message) errorMsg = err.message.toUpperCase();

    return { isUp: false, statusCode: 0, duration, error: errorMsg };
  }
}

// Helper to run promises in chunks
async function runInChunks<T, R>(items: T[], chunkSize: number, asyncFn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(asyncFn));
    results.push(...chunkResults);
    if (i + chunkSize < items.length) {
      await new Promise((res) => setTimeout(res, 100)); // Reduced delay
    }
  }
  return results;
}

export default async function Dashboard() {
  const checksInput = services.flatMap((s) =>
    s.environments.map((e) => ({ serviceId: s.id, serviceName: s.name, env: e.name, url: e.url }))
  );

  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  const [results, lastCheck] = await Promise.all([
    runInChunks(checksInput, 10, async (c) => ({ // Increased chunk size to 10 for faster parallel checks
      ...c,
      ...(await checkService(c.url)),
    })),
    hasKV ? kv.get<string>('last_check').catch(() => null) : Promise.resolve(null),
  ]);

  return <DashboardClient services={services} results={results} lastCheck={lastCheck} />;
}

