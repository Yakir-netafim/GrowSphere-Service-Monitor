import { ServiceConfig } from '../types';

export const services: ServiceConfig[] = [
    {
        id: 'crop-service',
        name: 'Crop Service',
        environments: [
            { name: 'Dev1', url: 'https://cropservice.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://cropservice-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://cropservice.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://cropservice.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'data-api',
        name: 'Data API',
        environments: [
            { name: 'Dev1', url: 'https://dataapi-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://dataapi-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://dataapi-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://dataapi.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'account-management',
        name: 'Account Management',
        environments: [
            { name: 'Dev1', url: 'https://accountmanagement-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://accountmanagement-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://accountmanagement-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://accountmanagement.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'mobile-bff',
        name: 'Mobile BFF',
        environments: [
            { name: 'Dev1', url: 'https://mobilebff-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://mobilebff-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://mobilebff-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://mobilebff.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'graph-api',
        name: 'Graph API',
        environments: [
            { name: 'Dev1', url: 'https://dev1-netbeatvx-graphapi-app-weu.azurewebsites.net/health' },
            { name: 'QA1', url: 'https://qa1-netbeatvx-graphapi-app-weu.azurewebsites.net/health' },
            { name: 'STAG', url: 'https://stag-netbeatvx-graphapi-app-weu.azurewebsites.net/health' },
            { name: 'PROD', url: 'https://prod-netbeatvx-graphapi-app-weu.azurewebsites.net/health' },
        ],
    },
    {
        id: 'timeseries-api',
        name: 'Timeseries API',
        environments: [
            { name: 'Dev1', url: 'https://timeseriesapi-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://timeseriesapi-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://timeseriesapi-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://timeseriesapi.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'irrigation-manager',
        name: 'Irrigation Manager',
        environments: [
            { name: 'Dev1', url: 'https://irrigationmanager-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://irrigationmanager-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://irrigationmanager-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://irrigationmanager.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'device-state-manager',
        name: 'Device State Manager',
        environments: [
            { name: 'Dev1', url: 'https://devicestatemanager-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://devicestatemanager-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://devicestatemanager-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://devicestatemanager.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'commands-manager',
        name: 'Commands Manager',
        environments: [
            { name: 'Dev1', url: 'https://commandsmanager-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://commandsmanager-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://commandsmanager-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://commandsmanager.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'signalr',
        name: 'SignalR',
        environments: [
            { name: 'Dev1', url: 'https://app-netbeatvx-signalr-dev1.azurewebsites.net/health' },
            { name: 'QA1', url: 'https://app-netbeatvx-signalr-qa1.azurewebsites.net/health' },
            { name: 'PROD', url: 'https://app-netbeatvx-signalr-prod.azurewebsites.net/health' },
        ],
    },
    {
        id: 'api-gateway',
        name: 'API Gateway',
        environments: [
            { name: 'Dev1', url: 'https://app-netbeatvx-apigateway-dev1.azurewebsites.net/health' },
            { name: 'QA1', url: 'https://app-netbeatvx-apigateway-qa1.azurewebsites.net/health' },
            { name: 'STAG', url: 'https://app-netbeatvx-apigateway-stag.azurewebsites.net/health' },
            { name: 'PROD', url: 'https://app-netbeatvx-apigateway-prod.azurewebsites.net/health' },
        ],
    },
    {
        id: 'settings-api',
        name: 'Settings API',
        environments: [
            { name: 'Dev1', url: 'https://settingsapi-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://settingsapi-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://settingsapi-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://settingsapi.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'irrigation-api',
        name: 'Irrigation API',
        environments: [
            { name: 'Dev1', url: 'https://irrigation-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://irrigation-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://irrigation-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://irrigation.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'report-api',
        name: 'Report API',
        environments: [
            { name: 'Dev1', url: 'https://dev1-netbeatvx-reportapi-app-weu.azurewebsites.net/health' },
            { name: 'QA1', url: 'https://qa1-netbeatvx-reportapi-app-weu.azurewebsites.net/health' },
            { name: 'STAG', url: 'https://stag-netbeatvx-reportapi-app-weu.azurewebsites.net/health' },
            { name: 'PROD', url: 'https://prod-netbeatvx-reportapi-app-weu.azurewebsites.net/health' },
        ],
    },
    {
        id: 'cs-api',
        name: 'CS API',
        environments: [
            { name: 'Dev1', url: 'https://csapi-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://csapi-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://csapi-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://csapi.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'weather-forecast',
        name: 'Weather Forecast',
        environments: [
            { name: 'Dev1', url: 'https://weatherforecast-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://weatherforecast-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://weatherforecast-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://weatherforecast.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'field-io',
        name: 'FieldIO',
        environments: [
            { name: 'Dev1', url: 'https://fieldio-dev1.k8s.growsphere.netafim.com/health' },
            { name: 'QA1', url: 'https://fieldio-qa1.k8s.growsphere.netafim.com/health' },
            { name: 'STAG', url: 'https://fieldio-stag.k8s.growsphere.netafim.com/health' },
            { name: 'PROD', url: 'https://fieldio.k8s.growsphere.netafim.com/health' },
        ],
    },
    {
        id: 'remote-sensing',
        name: 'Remote Sensing',
        environments: [
            { name: 'Dev1', url: 'https://remotesensing-dev1.k8s.growsphere.netafim.com/health' },
        ],
    },
];
