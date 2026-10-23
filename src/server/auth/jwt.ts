import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthSession } from './types.js';

const DEFAULT_SECRET = process.env.SESSION_SECRET || process.env.OWNER_TOKEN || 'opendots-default-secret-change-in-production';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf8');
}

export function signSession(
  payload: Omit<AuthSession, 'iat' | 'exp'>,
  secret: string = DEFAULT_SECRET,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const session: AuthSession = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(session));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret).update(data).digest();
  const encodedSignature = base64UrlEncode(signature.toString('binary'));

  return `${data}.${encodedSignature}`;
}

export function verifySession(
  token: string,
  secret: string = DEFAULT_SECRET,
): AuthSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', secret).update(data).digest();
    const actualSignature = Buffer.from(
      base64UrlDecode(encodedSignature),
      'binary',
    );

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const session: AuthSession = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (session.exp && session.exp < now) {
      // Expired token
      return null;
    }

    return session;
  } catch {
    return null;
  }
}
