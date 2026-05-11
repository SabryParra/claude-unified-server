import { describe, it, expect } from 'bun:test';
import { issueDeviceToken, verifyToken, extractBearer } from '~/lib/auth.ts';

describe('issueDeviceToken', () => {
  it('returns token, userId, deviceId', async () => {
    const result = await issueDeviceToken({ deviceName: 'test-device' });
    expect(result.token).toBeString();
    expect(result.token.split('.').length).toBe(3); // JWT format
    expect(result.userId).toBeString();
    expect(result.deviceId).toBeString();
  });

  it('uses provided userId when given', async () => {
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const result = await issueDeviceToken({ userId });
    expect(result.userId).toBe(userId);
  });

  it('generates different deviceIds each call', async () => {
    const a = await issueDeviceToken({});
    const b = await issueDeviceToken({});
    expect(a.deviceId).not.toBe(b.deviceId);
  });
});

describe('verifyToken', () => {
  it('verifies a freshly issued token', async () => {
    const { token, userId, deviceId } = await issueDeviceToken({
      deviceName: 'verify-test',
      scope: ['read', 'write'],
    });
    const claims = await verifyToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe(userId);
    expect(claims!.device).toBe(deviceId);
    expect(claims!.scope).toEqual(['read', 'write']);
  });

  it('returns null for a tampered token', async () => {
    const { token } = await issueDeviceToken({});
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p}.INVALIDSIG${s?.slice(10)}`;
    expect(await verifyToken(tampered)).toBeNull();
  });

  it('returns null for a random string', async () => {
    expect(await verifyToken('not.a.token')).toBeNull();
    expect(await verifyToken('')).toBeNull();
  });
});

describe('extractBearer', () => {
  it('extracts token from valid Authorization header', () => {
    expect(extractBearer('Bearer my-token-here')).toBe('my-token-here');
    expect(extractBearer('bearer my-token-here')).toBe('my-token-here');
  });

  it('returns null for missing or malformed header', () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('')).toBeNull();
    expect(extractBearer('Basic abc123')).toBeNull();
    expect(extractBearer('Bearer')).toBeNull();
  });
});
