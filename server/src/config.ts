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
  docAi: {
    projectId: process.env.DOC_AI_PROJECT_ID || '',
    location: process.env.DOC_AI_LOCATION || '',
    processorId: process.env.DOC_AI_PROCESSOR_ID || ''
  },
  opportunities: {
    samApiKey: process.env.SAM_API_KEY || '',
    defaultKeywords: (process.env.OPP_DEFAULT_KEYWORDS || 'substation,renewable,data center,utility,industrial').split(',').map((w) => w.trim()).filter(Boolean),
    rssFeeds: (process.env.OPP_RSS_FEEDS ||
      'https://news.google.com/rss/search?q=Kansas%20expansion%20construction&hl=en-US&gl=US&ceid=US:en,https://www.constructionequipmentguide.com/rss/industry-news').split(',').map((url) => url.trim()).filter(Boolean)
  },
  market: {
    blsApiKey: process.env.BLS_API_KEY || '',
    nrelApiKey: process.env.NREL_API_KEY || 'DEMO_KEY',
    eiaApiKey: process.env.EIA_API_KEY || 'DEMO_KEY'
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




