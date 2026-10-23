import { OAuth2Client } from 'google-auth-library';
import type { UserProfile } from './types.js';

let oauthClient: OAuth2Client | null = null;

function getClient(clientId?: string): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(clientId);
  }
  return oauthClient;
}

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

export async function verifyGoogleToken(
  credential: string,
  expectedClientId?: string,
): Promise<GoogleTokenPayload> {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Credential token is missing or invalid.');
  }

  // Support test mocks during automated tests
  if (
    (process.env.NODE_ENV === 'test' || process.env.AUTH_DEV_MODE === 'true') &&
    credential.startsWith('test-mock-token:')
  ) {
    const [, email, name, sub] = credential.split(':');
    return {
      sub: sub || 'test-google-sub-12345',
      email: email || 'tester@example.com',
      name: name || 'Test User',
      picture: 'https://lh3.googleusercontent.com/a/default-user',
      email_verified: true,
    };
  }

  const clientId = expectedClientId || process.env.GOOGLE_CLIENT_ID;

  // 1. Try local cryptographic verification via OAuth2Client
  try {
    const client = getClient(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId || undefined,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new Error('Invalid token payload: missing sub or email.');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture,
      email_verified: payload.email_verified,
    };
  } catch (clientErr) {
    // 2. Fallback to Google TokenInfo endpoint
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      );
      if (!response.ok) {
        throw new Error(`Google token validation failed: HTTP ${response.status}`);
      }
      const data = (await response.json()) as Record<string, string>;
      if (!data.sub || !data.email) {
        throw new Error('Invalid Google tokeninfo response: missing sub or email.');
      }
      if (clientId && data.aud && data.aud !== clientId) {
        throw new Error('Token audience does not match configured Google Client ID.');
      }
      return {
        sub: data.sub,
        email: data.email,
        name: data.name || data.email.split('@')[0],
        picture: data.picture,
        email_verified: data.email_verified === 'true',
      };
    } catch (fallbackErr) {
      const msg = clientErr instanceof Error ? clientErr.message : String(clientErr);
      throw new Error(`Failed to verify Google ID token: ${msg}`);
    }
  }
}
