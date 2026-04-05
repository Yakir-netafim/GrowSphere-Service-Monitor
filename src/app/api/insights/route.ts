import { NextResponse } from 'next/server';
import { getServiceInsights } from '@/lib/azure-insights';

export const dynamic = 'force-dynamic';

/**
 * GET /api/insights?appId={applicationInsightsAppId}
 * Returns InsightsSummary for the given Application Insights resource.
 * Auth is handled server-side via Entra ID (AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET env vars).
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId');

    if (!appId) {
        return NextResponse.json({ error: 'Missing required query param: appId' }, { status: 400 });
    }

    const result = await getServiceInsights(appId);

    if (!result.available) {
        return NextResponse.json(result, { status: 200 }); // Return 200 even if empty to avoid console errors
    }

    return NextResponse.json(result, {
        headers: {
            // Cache for 5 minutes on the CDN edge — AI data doesn't need to be real-time
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
    });
}
