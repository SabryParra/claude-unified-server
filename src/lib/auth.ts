/**
 * auth.ts — JWT device auth (jose lib)
 *
 * Flow :
 *   1. User init device : POST /api/v1/auth/device → server retourne JWT
 *   2. Toutes les routes /api/v1/sync/* exigent ce JWT en Authorization header
 *
 * Le JWT contient :
 *   - sub : user-id (uuid)
 *   - device : device-id (uuid)
 *   - scope : ["read", "write"] ou ["read"]
 *   - iat / exp
 */

import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'CHANGE_ME_IN_PRODUCTION_USE_OPENSSL_RAND_HEX_32',
);

const TOKEN_TTL = '365d'; // 1 an, révocable côté serveur

export interface DeviceClaims {
  sub: string; // user id
  device: string; // device id
  scope: string[];
  iat: number;
  exp: number;
}

export async function issueDeviceToken(opts: {
  userId?: string;
  deviceName?: string;
  scope?: string[];
}): Promise<{ token: string; userId: string; deviceId: string }> {
  const userId = opts.userId ?? randomUUID();
  const deviceId = randomUUID();
  const scope = opts.scope ?? ['read', 'write'];

  const token = await new SignJWT({ device: deviceId, scope, name: opts.deviceName ?? 'device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(JWT_SECRET);

  return { token, userId, deviceId };
}

export async function verifyToken(token: string): Promise<DeviceClaims | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as DeviceClaims;
  } catch {
    return null;
  }
}

export function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}
