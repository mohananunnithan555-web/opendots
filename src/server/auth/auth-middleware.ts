import type { Context, Next } from 'hono';
import { getSessionFromRequest } from './auth-routes.js';
import type { AuthStore } from './auth-store.js';
import type { UserProfile } from './types.js';

export function createAuthContextMiddleware(authStore: AuthStore, ownerToken?: string) {
  return async (c: Context, next: Next) => {
    const session = getSessionFromRequest(c);
    if (session) {
      const user = authStore.getUserById(session.userId);
      if (user) {
        (c.set as any)('user', user);
        (c.set as any)('userId', user.id);
        (c.set as any)('userEmail', user.email);
        return next();
      }
    }

    // Check legacy owner token
    if (ownerToken) {
      const authHeader = c.req.header('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token === ownerToken) {
          (c.set as any)('userId', 'opendots-owner');
          (c.set as any)('isOwnerToken', true);
          return next();
        }
      }
    }

    // Default to 'opendots-owner' for backward compatibility in single-user/guest mode
    (c.set as any)('userId', 'opendots-owner');
    (c.set as any)('isGuest', true);
    return next();
  };
}
