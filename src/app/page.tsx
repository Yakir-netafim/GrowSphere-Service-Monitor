import { services } from '@/app/config/services';
import DashboardClient from '@/app/components/DashboardClient';
import { kv } from '@vercel/kv';

export const dynamic = 'force-dynamic';

async function checkService(url: string): Promise<{ isUp: boolean; statusCode: number; duration: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeoutId);
    return { isUp: res.ok, statusCode: res.status, duration: Date.now() - start };
  } catch {
    return { isUp: false, statusCode: 0, duration: Date.now() - start };
  }
}

export default async function Dashboard() {
  const checksInput = services.flatMap((s) =>
    s.environments.map((e) => ({ serviceId: s.id, serviceName: s.name, env: e.name, url: e.url }))
  );

  // Run health checks and fetch last cron timestamp in parallel
  // KV is only available in production (Vercel). Fall back to null locally.
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  const [results, lastCheck] = await Promise.all([
    Promise.all(
      checksInput.map(async (c) => ({
        ...c,
        ...(await checkService(c.url)),
      }))
    ),
    hasKV ? kv.get<string>('last_check').catch(() => null) : Promise.resolve(null),
  ]);

  return <DashboardClient services={services} results={results} lastCheck={lastCheck} />;
}
