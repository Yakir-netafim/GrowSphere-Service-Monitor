/**
 * Azure Application Insights — query helper
 * Auth: Microsoft Entra ID (client_credentials)
 * API keys were retired on 31 March 2026.
 *
 * Required env vars:
 *   AZURE_TENANT_ID      – e.g. netafim.onmicrosoft.com or GUID
 *   AZURE_CLIENT_ID      – App Registration client ID
 *   AZURE_CLIENT_SECRET  – App Registration client secret
 */

export interface InsightsSummary {
    failedRequests24h: number;
    totalRequests24h: number;
    errorRate: number;               // percentage 0-100
    topException: string | null;     // e.g. "KeyVaultAccessException"
    topDependencyFailure: string | null; // e.g. "Azure DocumentDB"
    available: true;
}

export interface InsightsUnavailable {
    available: false;
    reason: string;
}

export type InsightsResult = InsightsSummary | InsightsUnavailable;

// ── Module-level token cache (server-side only) ───────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEntraToken(): Promise<string | null> {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) return null;

    // Re-use cached token if still valid (5-min buffer before expiry)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
        return cachedToken.token;
    }

    try {
        const res = await fetch(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                    scope: 'https://api.applicationinsights.io/.default',
                }).toString(),
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            console.error('Entra token request failed:', res.status, await res.text());
            return null;
        }

        const data = await res.json();
        cachedToken = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in - 60) * 1000,
        };
        return cachedToken.token;
    } catch (e) {
        console.error('Entra token fetch error:', e);
        return null;
    }
}

async function queryAI(
    appId: string,
    query: string,
    token: string
): Promise<unknown[][] | null> {
    try {
        const res = await fetch(
            `https://api.applicationinsights.io/v1/apps/${appId}/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
                cache: 'no-store',
            }
        );

        if (!res.ok) {
            console.error(`AI query failed (${appId}):`, res.status);
            return null;
        }

        const data = await res.json();
        return (data?.tables?.[0]?.rows as unknown[][] | undefined) ?? null;
    } catch (e) {
        console.error('AI query error:', e);
        return null;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getServiceInsights(appId: string): Promise<InsightsResult> {
    const token = await getEntraToken();

    if (!token) {
        return {
            available: false,
            reason: 'Azure credentials not configured (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET)',
        };
    }

    const [failedReqRows, exceptionRows, depRows] = await Promise.all([
        // Total vs failed requests in last 24h
        queryAI(
            appId,
            `requests
             | where timestamp > ago(24h)
             | summarize failed = countif(success == false), total = count()`,
            token
        ),
        // Top exception type
        queryAI(
            appId,
            `exceptions
             | where timestamp > ago(24h)
             | summarize count() by type
             | top 1 by count_ desc`,
            token
        ),
        // Top failed dependency type
        queryAI(
            appId,
            `dependencies
             | where timestamp > ago(24h)
             | where success == false
             | summarize count() by type
             | top 1 by count_ desc`,
            token
        ),
    ]);

    if (!failedReqRows) {
        return { available: false, reason: 'Application Insights query failed' };
    }

    const failed = (failedReqRows[0]?.[0] as number) ?? 0;
    const total  = (failedReqRows[0]?.[1] as number) ?? 0;

    // Shorten exception class names: "System.Net.Http.HttpRequestException" → "HttpRequestException"
    const rawException = (exceptionRows?.[0]?.[0] as string | null) ?? null;
    const topException = rawException ? rawException.split('.').pop() ?? rawException : null;

    const topDep = (depRows?.[0]?.[0] as string | null) ?? null;

    return {
        available: true,
        failedRequests24h: failed,
        totalRequests24h: total,
        errorRate: total > 0 ? Math.round((failed / total) * 100) : 0,
        topException,
        topDependencyFailure: topDep,
    };
}
