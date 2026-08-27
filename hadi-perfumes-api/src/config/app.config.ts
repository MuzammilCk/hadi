import * as Joi from 'joi';

export const envSchema = Joi.object({
  // CRITICAL — app will not start without these
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  // ADMIN_TOKEN is no longer used — admin auth is now JWT-based via JwtAuthGuard + RolesGuard.
  ADMIN_TOKEN: Joi.string().optional(),

  // REDIS_URL: required only when QueueModule is active (non-test, non-local-only)
  // In local dev without Redis, the app boots but jobs won't queue (graceful degradation).
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // IMPORTANT — will warn on missing but not crash
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  SUPABASE_URL: Joi.string().optional(),
  SUPABASE_SERVICE_KEY: Joi.string().optional(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('media'),
  DEFAULT_CURRENCY: Joi.string().default('INR'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
  PORT: Joi.number().default(3000),

  // Job config
  COMMISSION_RELEASE_BATCH_SIZE: Joi.number().default(100),
  COMMISSION_CALC_BATCH_SIZE: Joi.number().default(50),
  COMMISSION_MAX_RETRIES: Joi.number().default(5),
  MAX_NETWORK_DEPTH: Joi.number().default(5),
  RESERVATION_TTL_SECONDS: Joi.number().default(900),
  MIN_PAYOUT_AMOUNT_INR: Joi.number().default(100),

  // Trust config
  RETURN_WINDOW_DAYS: Joi.number().default(30),
  DISPUTE_AUTO_ESCALATE_HOURS: Joi.number().default(72),
  RISK_WEIGHT_LOW: Joi.number().default(5),
  RISK_WEIGHT_MEDIUM: Joi.number().default(15),
  RISK_WEIGHT_HIGH: Joi.number().default(30),
  RISK_WEIGHT_CRITICAL: Joi.number().default(50),

  // Throttle
  THROTTLE_TTL_SECONDS: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
});

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });
  if (error) {
    const missing = error.details.map((d) => d.message).join('\n');
    throw new Error(`FATAL: Invalid environment configuration:\n${missing}`);
  }
  return value;
}
