export type EnvName = 'Dev1' | 'Dev2' | 'QA1' | 'STAG' | 'PROD';

export interface ServiceEnv {
  name: EnvName;
  url: string;
}

export interface ServiceConfig {
  id: string;
  name: string;
  environments: ServiceEnv[];
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
