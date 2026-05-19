export declare const config: {
    port: number;
    nodeEnv: string;
    db: {
        host: string;
        port: number;
        user: string;
        password: string;
        name: string;
        poolMin: number;
        poolMax: number;
    };
    redis: {
        host: string;
        port: number;
        password: string | undefined;
        db: number;
    };
    jwt: {
        accessSecret: string;
        refreshSecret: string;
        accessExpiresIn: string;
        refreshExpiresIn: string;
    };
    aws: {
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
        s3Bucket: string;
        cloudfrontUrl: string;
    };
    cors: {
        origins: string[];
    };
    rateLimit: {
        authenticatedMaxRequests: number;
        unauthenticatedMaxRequests: number;
        windowMs: number;
    };
    bcrypt: {
        saltRounds: number;
    };
};
//# sourceMappingURL=index.d.ts.map