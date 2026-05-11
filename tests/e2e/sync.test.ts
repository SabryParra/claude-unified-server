import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { rm } from 'node:fs/promises';
import { createApp } from '~/server/app.ts';
import { ensureDataDir, DATA_DIR } from '~/lib/storage.ts';

// CUS_DATA_DIR = ./test-data (set in bunfig.toml)

const app = createApp();
let token: string;
let authHeader: () => { Authorization: string };

beforeAll(async () => {
  await ensureDataDir();

  const res = await app.request('/api/v1/auth/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName: 'sync-test-device' }),
  });
  const body = (await res.json()) as { token: string };
  token = body.token;
  authHeader = () => ({ Authorization: `Bearer ${token}` });
});

afterAll(async () => {
  await rm(DATA_DIR, { recursive: true, force: true });
});

describe('PUT /api/v1/sync/:kind/:name', () => {
  it('stores a skill', async () => {
    const res = await app.request('/api/v1/sync/skills/my-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: '# My Skill\nDoes cool things.' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['kind']).toBe('skills');
    expect(body['name']).toBe('my-skill');
  });

  it('stores an agent', async () => {
    const res = await app.request('/api/v1/sync/agents/my-agent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: '# Agent\nHelps with tasks.' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects unknown kind', async () => {
    const res = await app.request('/api/v1/sync/invalid-kind/foo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['error']).toBe('unknown_kind');
  });

  it('rejects invalid resource name', async () => {
    const res = await app.request('/api/v1/sync/skills/bad name!', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects content containing secrets', async () => {
    const secret = 'ghp_' + 'A'.repeat(36);
    const res = await app.request('/api/v1/sync/skills/leaked', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: `token: ${secret}` }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['error']).toBe('secret_detected');
  });

  it('rejects unauthenticated PUT', async () => {
    const res = await app.request('/api/v1/sync/skills/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/sync/:kind/:name', () => {
  beforeAll(async () => {
    await app.request('/api/v1/sync/commands/my-cmd', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: '# My Command\nDoes something.' }),
    });
  });

  it('retrieves a stored resource', async () => {
    const res = await app.request('/api/v1/sync/commands/my-cmd', {
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['content']).toBe('# My Command\nDoes something.');
    expect(body['kind']).toBe('commands');
    expect(body['name']).toBe('my-cmd');
  });

  it('returns 404 for missing resource', async () => {
    const res = await app.request('/api/v1/sync/skills/does-not-exist', {
      headers: authHeader(),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/sync/manifest', () => {
  it('returns all stored kinds', async () => {
    const res = await app.request('/api/v1/sync/manifest', {
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const manifest = body['manifest'] as Record<string, unknown[]>;
    expect(Array.isArray(manifest['skills'])).toBe(true);
    expect((manifest['skills'] ?? []).length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/sync/:kind', () => {
  it('lists resources by kind', async () => {
    const res = await app.request('/api/v1/sync/skills', {
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body['count']).toBe('number');
    expect(Array.isArray(body['items'])).toBe(true);
  });
});

describe('DELETE /api/v1/sync/:kind/:name', () => {
  beforeAll(async () => {
    await app.request('/api/v1/sync/agents/to-delete', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content: 'temporary agent' }),
    });
  });

  it('deletes an existing resource', async () => {
    const res = await app.request('/api/v1/sync/agents/to-delete', {
      method: 'DELETE',
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
  });

  it('returns ok:false for missing resource', async () => {
    const res = await app.request('/api/v1/sync/agents/ghost', {
      method: 'DELETE',
      headers: authHeader(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(false);
  });
});

describe('Sync isolation — different users', () => {
  let token2: string;

  beforeAll(async () => {
    const res = await app.request('/api/v1/auth/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: 'other-device' }),
    });
    const body = (await res.json()) as { token: string };
    token2 = body.token;
  });

  it("user2 cannot read user1's resources", async () => {
    const res = await app.request('/api/v1/sync/skills/my-skill', {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(res.status).toBe(404);
  });
});
