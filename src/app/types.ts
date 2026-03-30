export type EnvName = 'Dev1' | 'Dev2' | 'QA1' | 'STAG' | 'PROD';

export interface ServiceEnv {
  name: EnvName;
  url: string;
}

export interface ServiceConfig {
  id: string;
  name: string;
  environments: ServiceEnv[];
  /** Application Insights App IDs per environment (optional) */
  appInsightsIds?: Partial<Record<EnvName, string>>;
}

export interface CheckResult {
  serviceName: string;
  envName: string;
  url: string;
  status: 'UP' | 'DOWN';
  statusCode: number;
  duration: number;
  timestamp: string;
}

/** Returned by /api/insights */
export interface InsightsSummary {
  available: true;
  failedRequests24h: number;
  totalRequests24h: number;
  errorRate: number;
  topException: string | null;
  topDependencyFailure: string | null;
}

export interface InsightsUnavailable {
  available: false;
  reason: string;
}

export type InsightsResult = InsightsSummary | InsightsUnavailable;

