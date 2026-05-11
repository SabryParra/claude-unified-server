import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { rm } from 'node:fs/promises';
import { createApp } from '~/server/app.ts';
import { ensureDataDir, DATA_DIR } from '~/lib/storage.ts';

// CUS_DATA_DIR is set to ./test-data via bunfig.toml

const app = createApp();

beforeAll(async () => {
  await ensureDataDir();
});

afterAll(async () => {
  await rm(DATA_DIR, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
  });

  it('GET /health/ready returns 200', async () => {
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/auth/device', () => {
  it('registers a new device and returns JWT', async () => {
    const res = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'test-laptop' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['token']).toBeString();
    expect(body['userId']).toBeString();
    expect(body['deviceId']).toBeString();
    expect((body['token'] as string).split('.').length).toBe(3);
  });

  it('rejects missing deviceName', async () => {
    const res = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('rejects too-long deviceName', async () => {
    const res = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'x'.repeat(65) }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/auth/whoami', () => {
  let token: string;

  beforeAll(async () => {
    const res = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'whoami-test' }),
    });
    const body = (await res.json()) as { token: string };
    token = body.token;
  });

  it('returns claims for a valid token', async () => {
    const res = await app.request('/api/v1/auth/whoami', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['userId']).toBeString();
    expect(body['deviceId']).toBeString();
    expect(Array.isArray(body['scope'])).toBe(true);
    expect(body['expiresAt']).toBeString();
  });

  it('returns 401 with no token', async () => {
    const res = await app.request('/api/v1/auth/whoami');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await app.request('/api/v1/auth/whoami', {
      headers: { Authorization: 'Bearer not.a.valid.jwt' },
    });
    expect(res.status).toBe(401);
  });
});

describe('Sync routes — auth enforcement', () => {
  it('GET /api/v1/sync/manifest requires token', async () => {
    const res = await app.request('/api/v1/sync/manifest');
    expect(res.status).toBe(401);
  });

  it('returns manifest for authenticated user', async () => {
    const devRes = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'manifest-test' }),
    });
    const { token } = (await devRes.json()) as { token: string };

    const res = await app.request('/api/v1/sync/manifest', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['manifest']).toBeDefined();
  });
});
