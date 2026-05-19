export interface ServiceHealth {
    status: 'up' | 'down';
    latencyMs?: number;
    error?: string;
}
export declare function checkMySQLHealth(): Promise<ServiceHealth>;
export declare function checkRedisHealth(): Promise<ServiceHealth>;
//# sourceMappingURL=healthChecks.d.ts.map