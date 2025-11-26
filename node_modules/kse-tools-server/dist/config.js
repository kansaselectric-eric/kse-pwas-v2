import 'dotenv/config';
export const config = {
    port: Number(process.env.PORT || 4000),
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
    graph: {
        tenantId: process.env.MS_TENANT_ID || '',
        clientId: process.env.MS_CLIENT_ID || '',
        clientSecret: process.env.MS_CLIENT_SECRET || ''
    },
    acumatica: {
        baseUrl: process.env.ACU_BASE_URL || '',
        token: process.env.ACU_TOKEN || '',
        tenant: process.env.ACU_TENANT || ''
    },
    auth: {
        jwtSecret: process.env.JWT_SECRET || 'kse-dev-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'kse-dev-refresh-secret',
        tokenTtlSeconds: Number(process.env.JWT_TTL_SECONDS || 3600),
        refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS || 60 * 60 * 24 * 7),
        allowedOrigins: (process.env.AUTH_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
        usersJson: process.env.AUTH_USERS_JSON || ''
    }
};
