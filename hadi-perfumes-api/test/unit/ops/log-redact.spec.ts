import { redactSensitive } from '../../../src/common/utils/log-redact.util';

describe('redactSensitive', () => {
  it('strips password field', () => {
    const result = redactSensitive({ password: 'secret123', name: 'test' });
    expect(result.password).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('strips otp field', () => {
    const result = redactSensitive({ otp: '123456', phone: '+911234567890' });
    expect(result.otp).toBe('[REDACTED]');
    expect(result.phone).toBe('+911234567890');
  });

  it('strips access_token field', () => {
    const result = redactSensitive({ access_token: 'jwt.token.here' });
    expect(result.access_token).toBe('[REDACTED]');
  });

  it('strips authorization header field', () => {
    const result = redactSensitive({
      authorization: 'Bearer abc123',
      path: '/api',
    });
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.path).toBe('/api');
  });

  it('strips x-admin-token field', () => {
    const result = redactSensitive({
      'x-admin-token': 'admin-secret',
    });
    expect(result['x-admin-token']).toBe('[REDACTED]');
  });

  it('strips stripe_secret_key field', () => {
    const result = redactSensitive({
      stripe_secret_key: 'sk_test_xxx',
      mode: 'test',
    });
    expect(result.stripe_secret_key).toBe('[REDACTED]');
    expect(result.mode).toBe('test');
  });

  it('strips cvv and card_number fields', () => {
    const result = redactSensitive({
      card_number: '4242424242424242',
      cvv: '123',
      holder: 'Test',
    });
    expect(result.card_number).toBe('[REDACTED]');
    expect(result.cvv).toBe('[REDACTED]');
    expect(result.holder).toBe('Test');
  });

  it('leaves non-sensitive fields untouched', () => {
    const input = { name: 'John', email: 'john@test.com', amount: 100 };
    const result = redactSensitive(input);
    expect(result).toEqual(input);
  });

  it('handles nested objects', () => {
    const result = redactSensitive({
      user: { name: 'Test', password: 'hidden' },
      meta: { key: 'value' },
    });
    expect(result.user.password).toBe('[REDACTED]');
    expect(result.user.name).toBe('Test');
    expect(result.meta.key).toBe('value');
  });

  it('handles null gracefully', () => {
    expect(redactSensitive(null as any)).toBeNull();
  });

  it('handles undefined gracefully', () => {
    expect(redactSensitive(undefined as any)).toBeUndefined();
  });

  it('handles non-object gracefully', () => {
    expect(redactSensitive('string' as any)).toBe('string');
  });

  it('is case-insensitive for field matching', () => {
    const result = redactSensitive({ Password: 'secret', JWT_SECRET: 'abc' });
    expect(result.Password).toBe('[REDACTED]');
    expect(result.JWT_SECRET).toBe('[REDACTED]');
  });
});
