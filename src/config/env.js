import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URI: process.env.MONGODB_URI,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',

  // Frontend origin: used for CORS and for links in emails
  CLIENT_URL: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  RESET_TOKEN_TTL_MINUTES: Number(process.env.RESET_TOKEN_TTL_MINUTES) || 15,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_USER,
  // Receives an email for every new appointment request. Empty = no hospital email.
  APPOINTMENT_NOTIFY_EMAIL: process.env.APPOINTMENT_NOTIFY_EMAIL || '',

  // WhatsApp Cloud API (Meta). Empty token or phone number ID = messages are printed to the console instead.
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  // Only needed to create / check message templates (npm run whatsapp:templates, startup check)
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v26.0',
  // Must match the language the templates were created in
  WHATSAPP_TEMPLATE_LANG: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
  // Added in front of 10-digit local numbers
  WHATSAPP_DEFAULT_COUNTRY_CODE: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),
  // Hospital staff numbers that get a WhatsApp for every new booking (comma-separated)
  WHATSAPP_NOTIFY_NUMBERS: (process.env.WHATSAPP_NOTIFY_NUMBERS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),

  // Managed Redis connection string (redis:// or rediss:// for TLS). Empty = no cache, MongoDB only.
  REDIS_URL: process.env.REDIS_URL || '',
  CACHE_TTL_SECONDS: Number(process.env.CACHE_TTL_SECONDS) || 3600,
  // Namespaces keys so several apps/environments can share one Redis database
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX ?? 'ezaaz:',

  // Uploaded files (doctor photos) are stored here and served at /uploads
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB) || 3,
});

export default env;
