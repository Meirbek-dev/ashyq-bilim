// next-auth.d.ts
import type { Role } from './permissions';
import 'next-auth';

interface UserRole {
  role: Role;
}

// Ambient global auth domain types (no import needed elsewhere)
declare global {
  interface AuthTokens {
    access_token: string;
    refresh_token: string;
    /** Epoch ms when the access token expires */
    expiry?: number;
    /** Additional token metadata */
    [key: string]: string | number | undefined;
  }

  interface AuthUser {
    id: number;
    email: string;
    username: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    avatar_image?: string;
    bio?: string;
    /** Additional user properties */
    [key: string]: string | number | boolean | undefined;
  }

  interface UserWithTokens extends AuthUser {
    tokens: AuthTokens;
  }

  interface SessionData {
    user: AuthUser;
    roles: UserRole[];
    tokens: AuthTokens;
    /** User's effective permissions as flat string array */
    permissions: string[];
  }

  interface TokenRefreshResult {
    tokens: AuthTokens;
    refreshed: boolean;
  }
}

declare module 'next-auth' {
  interface Session {
    user: AuthUser;
    roles?: UserRole[];
    tokens?: AuthTokens;
    expires: string;
    /** User's effective permissions as flat string array */
    permissions?: string[];
  }

  type User = UserWithTokens;
}

declare module 'next-auth/jwt' {
  interface JWT {
    user?: UserWithTokens;
    /** Cached permissions */
    permissions?: string[];
  }
}
