import { validateEnv } from '../../../src/config/app.config';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    JWT_SECRET: 'a'.repeat(32),
    ADMIN_TOKEN: 'b'.repeat(16),
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'development',
  };

  it('throws on missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow('DATABASE_URL');
  });

  it('throws on missing JWT_SECRET', () => {
    const { JWT_SECRET, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow('JWT_SECRET');
  });

  it('throws on JWT_SECRET shorter than 32 chars', () => {
    expect(() => validateEnv({ ...validConfig, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('throws on missing ADMIN_TOKEN', () => {
    const { ADMIN_TOKEN, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow('ADMIN_TOKEN');
  });

  it('throws on ADMIN_TOKEN shorter than 16 chars', () => {
    expect(() =>
      validateEnv({ ...validConfig, ADMIN_TOKEN: 'short' }),
    ).toThrow('ADMIN_TOKEN');
  });

  it('throws on missing REDIS_URL', () => {
    const { REDIS_URL, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow('REDIS_URL');
  });

  it('passes with all required fields', () => {
    expect(() => validateEnv(validConfig)).not.toThrow();
  });

  it('applies defaults for optional fields', () => {
    const result = validateEnv(validConfig);
    expect(result['DEFAULT_CURRENCY']).toBe('INR');
    expect(result['PORT']).toBe(3000);
    expect(result['THROTTLE_TTL_SECONDS']).toBe(60);
    expect(result['THROTTLE_LIMIT']).toBe(100);
    expect(result['RETURN_WINDOW_DAYS']).toBe(30);
  });

  it('collects all errors before throwing (abortEarly: false)', () => {
    try {
      validateEnv({});
      fail('Should have thrown');
    } catch (err: any) {
      // Should mention multiple missing fields in one error
      expect(err.message).toContain('DATABASE_URL');
      expect(err.message).toContain('JWT_SECRET');
      expect(err.message).toContain('ADMIN_TOKEN');
      expect(err.message).toContain('REDIS_URL');
    }
  });

  it('allows unknown env vars', () => {
    expect(() =>
      validateEnv({ ...validConfig, MY_CUSTOM_VAR: 'hello' }),
    ).not.toThrow();
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() =>
      validateEnv({ ...validConfig, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });
});
