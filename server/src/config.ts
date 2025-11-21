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
  }
};




