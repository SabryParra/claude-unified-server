import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { issueDeviceToken } from '~/lib/auth.ts';
import { appendAudit } from '~/lib/storage.ts';

export const authRoutes = new Hono();

const deviceSchema = z.object({
  deviceName: z.string().min(1).max(64),
  userId: z.string().uuid().optional(),
  inviteCode: z.string().optional(),
});

/**
 * POST /api/v1/auth/device
 * Crée un nouveau token pour un device. Sans userId → nouvel utilisateur.
 * Avec userId + inviteCode → ajoute device à user existant.
 */
authRoutes.post('/device', zValidator('json', deviceSchema), async (c) => {
  const body = c.req.valid('json');

  // TODO Phase 2 : valider inviteCode pour rattacher device à user existant
  // Pour Phase 1 MVP : chaque init = nouveau user

  const { token, userId, deviceId } = await issueDeviceToken({
    userId: body.userId,
    deviceName: body.deviceName,
  });

  await appendAudit(userId, {
    event: 'device_registered',
    deviceId,
    deviceName: body.deviceName,
    ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
  });

  return c.json({
    token,
    userId,
    deviceId,
    instructions: 'Save this token securely — it cannot be retrieved later.',
  });
});

/**
 * GET /api/v1/auth/whoami
 * Vérifie un token et retourne ses claims.
 */
authRoutes.get('/whoami', async (c) => {
  const { verifyToken, extractBearer } = await import('~/lib/auth.ts');
  const token = extractBearer(c.req.header('authorization'));
  if (!token) return c.json({ error: 'missing_token' }, 401);
  const claims = await verifyToken(token);
  if (!claims) return c.json({ error: 'invalid_token' }, 401);
  return c.json({
    userId: claims.sub,
    deviceId: claims.device,
    scope: claims.scope,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  });
});
