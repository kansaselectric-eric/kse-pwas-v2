import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 8080),
  dbUrl: process.env.ESTACC_DATABASE_URL || process.env.DATABASE_URL || '',
  openAiApiKey: process.env.ESTACC_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
  openAiBaseUrl: (process.env.ESTACC_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/+$/,
    ''
  ),
  ocrModel: process.env.ESTACC_OCR_MODEL || 'gpt-4.1',
  takeoffModel: process.env.ESTACC_TAKEOFF_MODEL || 'gpt-4.1'
};
