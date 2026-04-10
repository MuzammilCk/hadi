const REDACT_FIELDS = [
  'password',
  'otp',
  'access_token',
  'refresh_token',
  'session_token',
  'authorization',
  'x-admin-token',
  'jwt_secret',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'client_secret',
  'card_number',
  'cvv',
];

export function redactSensitive(
  obj: Record<string, any>,
): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => (typeof item === 'object' && item !== null ? redactSensitive(item) : item));
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (REDACT_FIELDS.some((f) => key.toLowerCase().includes(f))) {
        return [key, '[REDACTED]'];
      }
      if (typeof value === 'object' && value !== null) {
        return [key, redactSensitive(value)];
      }
      return [key, value];
    }),
  );
}
