import type { Context, Next } from 'hono';
import { extractBearer, verifyToken } from '~/lib/auth.ts';

export async function authMiddleware(c: Context, next: Next) {
  const token = extractBearer(c.req.header('authorization'));
  if (!token) {
    return c.json({ error: 'missing_token' }, 401);
  }
  const claims = await verifyToken(token);
  if (!claims) {
    return c.json({ error: 'invalid_token' }, 401);
  }
  c.set('userId', claims.sub);
  c.set('deviceId', claims.device);
  c.set('scope', claims.scope);
  await next();
}

export function requireScope(scope: 'read' | 'write') {
  return async (c: Context, next: Next) => {
    const scopes = c.get('scope') as string[] | undefined;
    if (!scopes?.includes(scope)) {
      return c.json({ error: 'insufficient_scope', required: scope }, 403);
    }
    await next();
  };
}
