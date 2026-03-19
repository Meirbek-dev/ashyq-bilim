import {
  getNewAccessTokenUsingRefreshTokenServer,
  getUserSession,
  loginAndGetToken,
  loginWithOAuthToken,
} from '@/services/auth/auth';
import { SESSION_CACHE_TTL_MS, TOKEN_REFRESH_BUFFER_MS } from '@/lib/constants';
import type { NextAuthConfig, NextAuthResult, Session } from 'next-auth';
import { getResponseMetadata } from '@/services/utils/ts/requests';
import Credentials from 'next-auth/providers/credentials';
import { getAbsoluteUrl } from '@/services/config/config';
import { getServerConfig } from '@/services/config/env';
import Google from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import { createHash } from 'node:crypto';
import NextAuth from 'next-auth';
import { cache } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const SESSION_UPDATE_AGE = 24 * 60 * 60; // 24 hours

export const isDevEnv = process.env.NODE_ENV !== 'production';

// ─── Cross-Request Session Store ──────────────────────────────────────────────
//
// React 19's cache() memoizes per request/render cycle, which handles
// deduplication within a single request. For cross-request persistence we
// maintain a plain Map with manual TTL eviction — same semantics as the
// former LRU TTL, without the size-bound eviction policy.
//
// If bounded memory is a concern in production, swap the Map for a size-aware
// structure (e.g., a simple FIFO ring-buffer map) without bringing back
// lru-cache.

interface TimestampedSessionData {
  data: SessionData;
  expiresAt: number;
}

const sessionStore = new Map<string, TimestampedSessionData>();

const setSession = (key: string, data: SessionData): void => {
  sessionStore.set(key, { data, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
};

const getSession = (key: string): SessionData | null => {
  const entry = sessionStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionStore.delete(key);
    return null;
  }
  return entry.data;
};

const deleteSession = (key: string): void => {
  sessionStore.delete(key);
};

// ─── Cache Key ────────────────────────────────────────────────────────────────

const createCacheKey = (accessToken: string): string | null => {
  if (!accessToken) return null;
  return `user_session_${createHash('sha256').update(accessToken).digest('hex')}`;
};

// ─── React 19 cache() — per-request deduplication ────────────────────────────
//
// cache() memoizes the wrapped function for the lifetime of a single server
// request. Repeated calls to fetchUserSession() with the same access token
// within one render tree are collapsed into one network round-trip.
// The result is NOT shared across requests — that is the job of sessionStore.

const fetchUserSession = cache(async (accessToken: string): Promise<Awaited<ReturnType<typeof getUserSession>>> => {
  return getUserSession(accessToken);
});

// ─── Token Helpers ────────────────────────────────────────────────────────────

const assertValidTokenExpiry = (expiry: unknown): number => {
  if (typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= 0) {
    throw new Error('Token expiry claim is missing or invalid');
  }
  if (expiry <= Date.now()) {
    throw new Error('Token is already expired');
  }
  return expiry;
};

const isTokenExpiringSoon = (expiry: number, bufferMs = TOKEN_REFRESH_BUFFER_MS): boolean => {
  const expiring = Date.now() + bufferMs >= expiry;
  if (expiring) {
    console.log('Token expiring soon, will refresh', {
      expiresAt: new Date(expiry).toISOString(),
      bufferMs,
    });
  }
  return expiring;
};

// ─── NextAuth Types ───────────────────────────────────────────────────────────

type AuthFunction = NextAuthResult['auth'];
type SignInFunction = NextAuthResult['signIn'];
type SignOutFunction = NextAuthResult['signOut'];
type AuthHandlers = NextAuthResult['handlers'];

// ─── Auth Config ──────────────────────────────────────────────────────────────

const createAuthConfig = (): NextAuthConfig => {
  const serverConfig = getServerConfig();
  const cookieDomain = !isDevEnv ? serverConfig.cookieDomain : undefined;
  const cookieSecure = !isDevEnv && serverConfig.cookieSecure;
  const cookieNamePrefix = cookieSecure ? '__Secure-' : '';

  return {
    debug: isDevEnv,

    providers: [
      Credentials({
        name: 'Credentials',
        credentials: {
          email: { label: 'Email', type: 'text', placeholder: 'user@example.com' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials): Promise<any> {
          if (!credentials || typeof credentials !== 'object') {
            console.warn('Missing credentials object');
            return null;
          }

          const { email: rawEmail, password: rawPassword } = credentials as Record<string, unknown>;

          if (typeof rawEmail !== 'string' || typeof rawPassword !== 'string') {
            console.warn('Credentials must be strings');
            return null;
          }

          if (!rawEmail.trim() || !rawPassword.trim()) {
            console.warn('Empty email or password');
            return null;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
            console.warn('Invalid email format');
            return null;
          }

          try {
            const res = await getResponseMetadata(await loginAndGetToken(rawEmail.toLowerCase().trim(), rawPassword));

            if (!res.success || !res.data) {
              console.warn('Authorization failed: invalid credentials or server error');
              return null;
            }

            const userData = res.data as UserWithTokens;
            if (!userData.tokens?.access_token || !userData.tokens?.refresh_token) {
              console.error('Missing required tokens in authorization response');
              return null;
            }

            return userData as any;
          } catch (error) {
            console.error('Authorization error:', error);
            return null;
          }
        },
      }),

      Google({
        clientId: serverConfig.googleClientId,
        clientSecret: serverConfig.googleClientSecret,
        authorization: { params: { scope: 'openid email profile' } },
      }),
    ],

    pages: {
      signIn: getAbsoluteUrl('/'),
      verifyRequest: getAbsoluteUrl('/'),
      error: getAbsoluteUrl('/'),
    },

    cookies: {
      sessionToken: {
        name: `${cookieNamePrefix}next-auth.session-token`,
        options: {
          httpOnly: true,
          sameSite: 'lax' as const,
          path: '/',
          domain: cookieDomain ? `.${cookieDomain}` : undefined,
          secure: cookieSecure,
        },
      },
    },

    session: {
      strategy: 'jwt',
      maxAge: SESSION_MAX_AGE,
      updateAge: SESSION_UPDATE_AGE,
    },

    trustHost: true,

    callbacks: {
      // ── jwt ──────────────────────────────────────────────────────────────
      async jwt({ token, user, account }): Promise<JWT | null> {
        try {
          // Credentials sign-in
          if (account?.provider === 'credentials' && user) {
            const u = user as unknown as UserWithTokens;
            if (!u.tokens?.access_token || !u.tokens?.refresh_token) {
              console.error('Invalid token data from credentials provider');
              return null;
            }
            assertValidTokenExpiry(u.tokens.expiry);
            token.user = u;
            return token;
          }

          // Google OAuth sign-in
          if (account?.provider === 'google' && user?.email && account.access_token) {
            try {
              const res = await getResponseMetadata(
                await loginWithOAuthToken(user.email.toLowerCase().trim(), 'google', account.access_token),
              );

              if (!res.success || !res.data) {
                console.error('OAuth authentication failed:', res);
                return null;
              }

              const userData = res.data as UserWithTokens;
              if (!userData.tokens?.access_token || !userData.tokens?.refresh_token) {
                console.error('Invalid token data from OAuth provider');
                return null;
              }
              assertValidTokenExpiry(userData.tokens.expiry);

              token.user = userData;
              return token;
            } catch (error) {
              console.error('OAuth authentication error:', error);
              return null;
            }
          }

          // Subsequent requests — refresh access token when nearing expiry
          const userWithTokens = token.user;
          if (!userWithTokens?.tokens) {
            console.warn('No user tokens found in JWT callback');
            return token;
          }

          const { tokens } = userWithTokens;
          const tokenExpiry = assertValidTokenExpiry(tokens.expiry);

          if (!isTokenExpiringSoon(tokenExpiry)) return token;

          console.log('Token expiring soon, attempting refresh...');

          if (!tokens.refresh_token) {
            console.error('No refresh token available');
            return null;
          }

          try {
            const refreshed = await getNewAccessTokenUsingRefreshTokenServer(tokens.refresh_token);

            if (!refreshed?.access_token || !refreshed?.refresh_token) {
              console.error('Token refresh failed: missing rotated token pair in response');
              return null;
            }

            const refreshedExpiry = assertValidTokenExpiry(refreshed.expiry);

            token.user = {
              ...userWithTokens,
              tokens: {
                ...tokens,
                access_token: refreshed.access_token,
                refresh_token: refreshed.refresh_token,
                expiry: refreshedExpiry,
              },
            } as UserWithTokens;

            console.log('Token refreshed successfully');
            return token;
          } catch (error) {
            console.error('Token refresh error:', error);
            const cacheKey = createCacheKey(tokens.access_token);
            if (cacheKey) deleteSession(cacheKey);
            return null;
          }
        } catch (error) {
          console.error('JWT callback error:', error);
          return null;
        }
      },

      // ── session ──────────────────────────────────────────────────────────
      async session({ session, token }): Promise<Session> {
        const userWithTokens = token.user;

        if (!userWithTokens?.tokens?.access_token) {
          console.warn('No valid token data for session callback');
          return session;
        }

        const { tokens } = userWithTokens;
        const cacheKey = createCacheKey(tokens.access_token);

        // 1. Cross-request cache hit
        const cached = cacheKey ? getSession(cacheKey) : null;
        if (cached) {
          return { ...session, ...cached };
        }

        // 2. fetchUserSession is wrapped with React 19 cache(), so concurrent
        //    calls within the same request are automatically deduplicated.
        try {
          const apiSession = await fetchUserSession(tokens.access_token);

          if (!apiSession?.user) {
            console.error('Invalid session data from getUserSession');
            return session;
          }

          const sessionData: SessionData = {
            user: apiSession.user,
            roles: apiSession.roles ?? [],
            tokens,
            permissions: apiSession.permissions ?? [],
          };

          if (cacheKey) setSession(cacheKey, sessionData);

          return { ...session, ...sessionData };
        } catch (error) {
          console.error('Failed to fetch user session:', error);
          if (cacheKey) deleteSession(cacheKey);

          return {
            ...session,
            user: {
              id: userWithTokens.id,
              email: userWithTokens.email,
              username: userWithTokens.username,
              first_name: userWithTokens.first_name,
              last_name: userWithTokens.last_name,
            },
            roles: [],
            tokens,
            permissions: [],
          };
        }
      },

      // ── authorized ────────────────────────────────────────────────────────
      async authorized({ auth, request: { nextUrl } }) {
        const isLoggedIn = Boolean(auth?.user);
        const isAuthPage = nextUrl.pathname.startsWith('/auth');

        if (isAuthPage) {
          return isLoggedIn ? Response.redirect(new URL('/redirect_from_auth', nextUrl)) : true;
        }

        return isLoggedIn;
      },
    },

    events: {
      async signOut(message) {
        const token = (message as any)?.token;
        const userWithTokens = token?.user as UserWithTokens | undefined;
        if (userWithTokens?.tokens?.access_token) {
          const cacheKey = createCacheKey(userWithTokens.tokens.access_token);
          if (cacheKey) deleteSession(cacheKey);
        }
      },
      async signIn({ user, account }) {
        const u = user as unknown as UserWithTokens;
        console.log(`User signed in: ${u.email} via ${account?.provider}`);
      },
    },
  };
};

// ─── Singleton NextAuth Result ────────────────────────────────────────────────

let nextAuthResultCache: NextAuthResult | null = null;

const getNextAuthResult = (): NextAuthResult => {
  if (nextAuthResultCache) return nextAuthResultCache;
  nextAuthResultCache = NextAuth(createAuthConfig());
  return nextAuthResultCache;
};

export const handlers: AuthHandlers = {
  GET(...args) {
    return getNextAuthResult().handlers.GET(...args);
  },
  POST(...args) {
    return getNextAuthResult().handlers.POST(...args);
  },
};

export const signIn = ((...args: Parameters<SignInFunction>) => getNextAuthResult().signIn(...args)) as SignInFunction;
export const signOut = ((...args: Parameters<SignOutFunction>) =>
  getNextAuthResult().signOut(...args)) as SignOutFunction;
export const auth = ((...args: Parameters<AuthFunction>) => getNextAuthResult().auth(...args)) as AuthFunction;
