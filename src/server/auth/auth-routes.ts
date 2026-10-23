import { Hono } from 'hono';
import { z } from 'zod';
import { AuthStore } from './auth-store.js';
import { verifyGoogleToken } from './google-verifier.js';
import { signSession, verifySession } from './jwt.js';
import { isCloudDatabaseEnabled } from '../db/postgres-pool.js';
import type { AuthSession, UserProfile } from './types.js';

export function getSessionFromRequest(c: { req: { header: (name: string) => string | undefined } }): AuthSession | null {
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const session = verifySession(token);
    if (session) return session;
  }

  // Also check cookie if available
  const cookieHeader = c.req.header('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/opendots_session=([^;]+)/);
    if (match && match[1]) {
      const session = verifySession(decodeURIComponent(match[1]));
      if (session) return session;
    }
  }

  return null;
}

export function authRoutes(authStore: AuthStore) {
  const app = new Hono();

  // Public auth configuration
  app.get('/config', (c) => {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    return c.json({
      googleClientId,
      hasGoogleAuth: Boolean(googleClientId || process.env.AUTH_DEV_MODE === 'true' || process.env.NODE_ENV === 'test'),
      cloudStorage: isCloudDatabaseEnabled(),
    });
  });

  // Verify Google credential and log in
  app.post('/google', async (c) => {
    const body = z
      .object({
        credential: z.string().min(10),
      })
      .safeParse(await c.req.json().catch(() => null));

    if (!body.success) {
      return c.json({ error: 'Valid Google credential is required.' }, 400);
    }

    try {
      const payload = await verifyGoogleToken(body.data.credential);
      const user = authStore.upsertGoogleUser({
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      });

      const token = signSession({
        userId: user.id,
        googleSub: user.googleSub,
        email: user.email,
        name: user.name,
        picture: user.picture,
      });

      const legacyStatus = authStore.checkHasLegacyData();

      // Set cookie for browser convenience (SameSite=Lax, HttpOnly=false or accessible by frontend)
      c.header(
        'Set-Cookie',
        `opendots_session=${encodeURIComponent(token)}; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`,
      );

      return c.json({
        ok: true,
        token,
        user,
        legacyDataFound: legacyStatus,
      });
    } catch (err) {
      console.warn('[auth/google] Sign-in failed:', err);
      return c.json(
        { error: err instanceof Error ? err.message : 'Google authentication failed.' },
        401,
      );
    }
  });

  // Get current user profile
  app.get('/me', (c) => {
    const session = getSessionFromRequest(c);
    const legacyStatus = authStore.checkHasLegacyData();

    if (!session) {
      return c.json({
        authenticated: false,
        guest: true,
        user: null,
        legacyDataFound: legacyStatus,
      });
    }

    const user = authStore.getUserById(session.userId);
    if (!user) {
      return c.json({
        authenticated: false,
        guest: true,
        user: null,
        legacyDataFound: legacyStatus,
      });
    }

    return c.json({
      authenticated: true,
      guest: false,
      user,
      legacyDataFound: legacyStatus,
    });
  });

  // Sign out
  app.post('/logout', (c) => {
    c.header(
      'Set-Cookie',
      'opendots_session=; Path=/; Max-Age=0; SameSite=Lax',
    );
    return c.json({ ok: true });
  });

  // Migrate legacy data
  app.post('/migrate-legacy', async (c) => {
    const session = getSessionFromRequest(c);
    if (!session) {
      return c.json({ error: 'Please sign in to migrate data.' }, 401);
    }

    try {
      const result = authStore.migrateLegacyData(session.userId);
      return c.json({
        ok: true,
        message: 'Legacy OpenDots data migrated to your account successfully.',
        migrated: result,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Migration failed.' },
        500,
      );
    }
  });

  // Export personal data
  app.get('/export', (c) => {
    const session = getSessionFromRequest(c);
    if (!session) {
      return c.json({ error: 'Please sign in to export your data.' }, 401);
    }

    try {
      const exportData = authStore.exportUserData(session.userId);
      c.header(
        'Content-Disposition',
        `attachment; filename="opendots-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      return c.json(exportData);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Export failed.' },
        500,
      );
    }
  });

  // Delete account with confirmation
  app.delete('/account', async (c) => {
    const session = getSessionFromRequest(c);
    if (!session) {
      return c.json({ error: 'Please sign in to delete your account.' }, 401);
    }

    const body = z
      .object({
        confirmEmail: z.string().email(),
      })
      .safeParse(await c.req.json().catch(() => null));

    if (!body.success || body.data.confirmEmail.toLowerCase() !== session.email.toLowerCase()) {
      return c.json(
        { error: 'Email confirmation does not match your signed-in email address.' },
        400,
      );
    }

    try {
      const result = authStore.deleteUserAccount(session.userId);
      c.header(
        'Set-Cookie',
        'opendots_session=; Path=/; Max-Age=0; SameSite=Lax',
      );
      return c.json({
        ok: true,
        message: 'Your OpenDots account and personal data have been completely deleted.',
        details: result,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Account deletion failed.' },
        500,
      );
    }
  });

  return app;
}
