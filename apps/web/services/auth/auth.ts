import { RequestBody, getResponseMetadata } from '@services/utils/ts/requests';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { getAPIUrl } from '@services/config/config';
import type { Role } from '@/types/permissions';

interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

interface UserRole {
  role: Role;
}

interface UserSessionResponse {
  user: AuthUser;
  roles: UserRole[];
  permissions: string[];
}

interface AuthError extends Error {
  status?: number;
  code?: string;
}

interface NewAccountBody {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

// Auth API configuration
const AUTH_ENDPOINTS = {
  login: 'auth/login',
  oauth: 'auth/oauth',
  logout: 'auth/logout',
  refresh: 'auth/refresh',
  userProfile: 'users/profile',
  userSession: 'users/session',
  resetPassword: 'users/reset_password',
  signup: 'users',
} as const;

// Utility functions for request creation
const createHeaders = (contentType: string, additionalHeaders?: Record<string, string>): Headers => {
  const headers = new Headers({ 'Content-Type': contentType });
  if (additionalHeaders) {
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }
  return headers;
};

const createAuthError = (message: string, status?: number, code?: string): AuthError => {
  const error = new Error(message) as AuthError;
  error.status = status;
  error.code = code;
  return error;
};

const handleAuthResponse = async <T>(response: Response, operation: string): Promise<T> => {
  if (!response.ok) {
    const errorMessage = `${operation} failed: ${response.status} ${response.statusText}`;
    throw createAuthError(errorMessage, response.status, operation.toUpperCase().replace(' ', '_'));
  }

  try {
    return await response.json();
  } catch {
    throw createAuthError(`Failed to parse ${operation} response`, response.status, 'PARSE_ERROR');
  }
};

// Input validation utilities
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): boolean => {
  return Boolean(password && password.length >= 8);
};

const sanitizeStringInput = (input: string): string => {
  return input.trim().toLowerCase();
};

/**
 * Login function with proper typing and validation
 * @param username - Email or username for login
 * @param password - User password
 * @returns Promise<Response> - Raw response for compatibility
 */
export async function loginAndGetToken(username: any, password: any): Promise<Response> {
  // Input validation
  if (!(username?.trim() && password?.trim())) {
    throw createAuthError('Username and password are required', 400, 'INVALID_CREDENTIALS');
  }

  const sanitizedUsername = sanitizeStringInput(username);

  // Validate email format if username appears to be an email
  if (sanitizedUsername.includes('@') && !validateEmail(sanitizedUsername)) {
    throw createAuthError('Invalid email format', 400, 'INVALID_EMAIL');
  }

  if (!validatePassword(password)) {
    throw createAuthError('Invalid password', 400, 'INVALID_PASSWORD');
  }

  try {
    const headers = createHeaders('application/x-www-form-urlencoded');
    const body = new URLSearchParams({
      username: sanitizedUsername,
      password,
    });

    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body,
      redirect: 'follow',
      credentials: 'include',
    };

    return await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.login}`, requestOptions);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`Login request failed: ${error.message}`, undefined, 'NETWORK_ERROR');
    }
    throw createAuthError('Unknown login error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * OAuth login with validation
 * @param email - User email from OAuth provider
 * @param provider - OAuth provider name
 * @param accessToken - OAuth access token
 * @returns Promise<Response> - Raw response for compatibility
 */
export async function loginWithOAuthToken(email: string, provider: string, accessToken: string): Promise<Response> {
  // Input validation
  if (!(email?.trim() && validateEmail(email))) {
    throw createAuthError('Valid email is required', 400, 'INVALID_EMAIL');
  }

  if (!provider?.trim()) {
    throw createAuthError('OAuth provider is required', 400, 'INVALID_PROVIDER');
  }

  if (!accessToken?.trim()) {
    throw createAuthError('OAuth access token is required', 400, 'INVALID_TOKEN');
  }

  try {
    const headers = createHeaders('application/json');
    const body = {
      email: sanitizeStringInput(email),
      provider: provider.toLowerCase().trim(),
      access_token: accessToken,
    };

    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'include',
    };

    return await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.oauth}`, requestOptions);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`OAuth login failed: ${error.message}`, undefined, 'OAUTH_ERROR');
    }
    throw createAuthError('Unknown OAuth error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Password reset link sender with validation
 * @param email - User email address
 * @returns Promise with response metadata
 */
export async function sendResetLink(email: string) {
  if (!(email?.trim() && validateEmail(email))) {
    throw createAuthError('Valid email is required', 400, 'INVALID_EMAIL');
  }

  try {
    const sanitizedEmail = sanitizeStringInput(email);
    const url = `${getAPIUrl()}${AUTH_ENDPOINTS.resetPassword}/send_reset_code/${encodeURIComponent(sanitizedEmail)}`;

    const result = await fetchWithRetry(url, RequestBody('POST', null, null));
    return await getResponseMetadata(result);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`Failed to send reset link: ${error.message}`, undefined, 'RESET_LINK_ERROR');
    }
    throw createAuthError('Unknown reset link error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Password reset with validation
 * @param email - User email address
 * @param newPassword - New password
 * @param resetCode - Password reset code
 * @returns Promise with response metadata
 */
export async function resetPassword(email: string, newPassword: string, resetCode: string) {
  // Input validation
  if (!(email?.trim() && validateEmail(email))) {
    throw createAuthError('Valid email is required', 400, 'INVALID_EMAIL');
  }

  if (!validatePassword(newPassword)) {
    throw createAuthError('Valid password is required', 400, 'INVALID_PASSWORD');
  }

  if (!resetCode?.trim()) {
    throw createAuthError('Reset code is required', 400, 'INVALID_RESET_CODE');
  }

  try {
    const sanitizedEmail = sanitizeStringInput(email);
    const params = new URLSearchParams({
      reset_code: resetCode.trim(),
      new_password: newPassword,
    });

    const url = `${getAPIUrl()}${AUTH_ENDPOINTS.resetPassword}/change_password/${encodeURIComponent(sanitizedEmail)}?${params}`;

    const result = await fetchWithRetry(url, RequestBody('POST', null, null));
    return await getResponseMetadata(result);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`Failed to reset password: ${error.message}`, undefined, 'PASSWORD_RESET_ERROR');
    }
    throw createAuthError('Unknown password reset error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Logout function
 * @returns Promise<Response> - Raw response for compatibility
 */
export async function logout(): Promise<Response> {
  try {
    const headers = createHeaders('application/x-www-form-urlencoded');
    const body = new URLSearchParams(); // Empty body for logout

    const requestOptions: RequestInit = {
      method: 'DELETE',
      headers,
      body,
      redirect: 'follow',
      credentials: 'include',
    };

    return await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.logout}`, requestOptions);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`Logout failed: ${error.message}`, undefined, 'LOGOUT_ERROR');
    }
    throw createAuthError('Unknown logout error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * User info retrieval with proper validation
 * @param token - JWT access token
 * @returns Promise<AuthUser> - User information
 */
export async function getUserInfo(token: string): Promise<AuthUser> {
  if (typeof globalThis.window === 'undefined') {
    throw createAuthError('getUserInfo can only be called on the client side', 400, 'CLIENT_SIDE_ONLY');
  }

  if (!token?.trim()) {
    throw createAuthError('Access token is required', 400, 'MISSING_TOKEN');
  }

  try {
    const { origin } = globalThis.location;
    const headers = createHeaders('application/json', {
      Authorization: `Bearer ${token.trim()}`,
      Origin: origin,
    });

    const requestOptions: RequestInit = {
      method: 'GET',
      headers,
      redirect: 'follow',
      credentials: 'include',
    };

    const response = await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.userProfile}`, requestOptions);
    return await handleAuthResponse<AuthUser>(response, 'get user info');
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw AuthError instances
      if ('status' in error) throw error;
      throw createAuthError(`Failed to fetch user info: ${error.message}`, undefined, 'USER_INFO_ERROR');
    }
    throw createAuthError('Unknown user info error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * User session retrieval with validation
 * @param token - JWT access token
 * @returns Promise<UserSessionResponse> - User session information
 */
export async function getUserSession(token: string): Promise<UserSessionResponse> {
  if (!token?.trim()) {
    throw createAuthError('Access token is required', 400, 'MISSING_TOKEN');
  }

  try {
    const headers = createHeaders('application/json', {
      Authorization: `Bearer ${token.trim()}`,
    });

    const requestOptions: RequestInit = {
      method: 'GET',
      headers,
      redirect: 'follow',
      credentials: 'include',
      cache: 'no-cache',
    };

    const response = await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.userSession}`, requestOptions);
    return await handleAuthResponse<UserSessionResponse>(response, 'get user session');
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw AuthError instances
      if ('status' in error) throw error;
      throw createAuthError(`Failed to fetch user session: ${error.message}`, undefined, 'USER_SESSION_ERROR');
    }
    throw createAuthError('Unknown user session error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Token refresh for client-side usage
 * @returns Promise<AuthTokens> - New token pair
 */
export async function getNewAccessTokenUsingRefreshToken(): Promise<AuthTokens> {
  try {
    const requestOptions: RequestInit = {
      method: 'GET',
      redirect: 'follow',
      credentials: 'include',
    };

    const response = await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.refresh}`, requestOptions);
    return await handleAuthResponse<AuthTokens>(response, 'refresh token');
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw AuthError instances
      if ('status' in error) throw error;
      throw createAuthError(`Failed to refresh token: ${error.message}`, undefined, 'TOKEN_REFRESH_ERROR');
    }
    throw createAuthError('Unknown token refresh error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Server-side token refresh with validation
 * @param refreshToken - Refresh token for server-side usage
 * @returns Promise<AuthTokens> - New token pair
 */
export async function getNewAccessTokenUsingRefreshTokenServer(refreshToken: string): Promise<AuthTokens> {
  if (!refreshToken?.trim()) {
    throw createAuthError('Refresh token is required', 400, 'MISSING_REFRESH_TOKEN');
  }

  const apiUrl = getAPIUrl();
  const fullUrl = `${apiUrl}${AUTH_ENDPOINTS.refresh}`;

  try {
    const headers = createHeaders('application/json', {
      Cookie: `refresh_token_cookie=${refreshToken.trim()}`,
    });

    const requestOptions: RequestInit = {
      method: 'GET',
      redirect: 'follow',
      headers,
      credentials: 'include',
      cache: 'no-cache',
    };

    console.log('[Auth] Attempting token refresh at:', fullUrl);
    const response = await fetchWithRetry(fullUrl, requestOptions);

    if (!response.ok) {
      console.error('[Auth] Token refresh failed:', response.status, response.statusText);
    }

    return await handleAuthResponse<AuthTokens>(response, 'refresh token server');
  } catch (error) {
    console.error('[Auth] Token refresh error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      apiUrl,
      fullUrl,
    });

    if (error instanceof Error) {
      // Re-throw AuthError instances
      if ('status' in error) throw error;
      throw createAuthError(
        `Server token refresh failed: ${error.message} (URL: ${fullUrl})`,
        undefined,
        'SERVER_TOKEN_REFRESH_ERROR',
      );
    }
    throw createAuthError('Unknown server token refresh error', undefined, 'UNKNOWN_ERROR');
  }
}

/**
 * Cookie-based token refresh with validation
 * @param cookieStore - Cookie store object (Next.js cookies() or similar)
 * @returns Promise<string | null> - Access token or null if failed
 */
export async function getAccessTokenFromRefreshTokenCookie(cookieStore: any): Promise<string | null> {
  if (!cookieStore || typeof cookieStore.get !== 'function') {
    console.error('Invalid cookie store provided');
    return null;
  }

  try {
    const refreshTokenCookie = cookieStore.get('refresh_token_cookie');

    if (!refreshTokenCookie?.value?.trim()) {
      return null; // No refresh token available
    }

    const tokenResponse = await getNewAccessTokenUsingRefreshTokenServer(refreshTokenCookie.value);
    return tokenResponse?.access_token || null;
  } catch (error) {
    console.error('Failed to get access token from refresh token cookie:', error);
    return null; // Fail silently for cookie-based operations
  }
}

/**
 * Signup function with validation
 * @param body - New account details
 * @returns Promise<Response> - Raw response for compatibility
 */
export async function signup(body: NewAccountBody): Promise<Response> {
  // Input validation
  if (!body) {
    throw createAuthError('Account details are required', 400, 'MISSING_BODY');
  }

  const { username, email, password, first_name, last_name } = body;

  if (!username?.trim()) {
    throw createAuthError('Username is required', 400, 'MISSING_USERNAME');
  }

  if (!(email?.trim() && validateEmail(email))) {
    throw createAuthError('Valid email is required', 400, 'INVALID_EMAIL');
  }

  if (!first_name?.trim()) {
    throw createAuthError('First name is required', 400, 'MISSING_FIRST_NAME');
  }

  if (!last_name?.trim()) {
    throw createAuthError('Last name is required', 400, 'MISSING_LAST_NAME');
  }

  try {
    const headers = createHeaders('application/json');
    const sanitizedBody: Record<string, string> = {
      username: username.trim(),
      email: sanitizeStringInput(email),
      password,
      first_name,
      last_name,
    };

    const requestOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(sanitizedBody),
      redirect: 'follow',
    };

    return await fetchWithRetry(`${getAPIUrl()}${AUTH_ENDPOINTS.signup}`, requestOptions);
  } catch (error) {
    if (error instanceof Error) {
      throw createAuthError(`Signup failed: ${error.message}`, undefined, 'SIGNUP_ERROR');
    }
    throw createAuthError('Unknown signup error', undefined, 'UNKNOWN_ERROR');
  }
}

// Export types for external usage
export type { AuthError, AuthTokens, AuthUser, LoginResponse, NewAccountBody, UserSessionResponse };

// Export utility functions for advanced usage
export { createAuthError, handleAuthResponse, validateEmail, validatePassword };

// Export constants for external usage
export { AUTH_ENDPOINTS };

/**
 * Helper function to check if an error is an AuthError
 * @param error - Error to check
 * @returns boolean indicating if error is an AuthError
 */
export const isAuthError = (error: unknown): error is AuthError => {
  return error instanceof Error && ('status' in error || 'code' in error);
};

/**
 * Helper function to extract error details for logging/monitoring
 * @param error - Error to extract details from
 * @returns Object with error details
 */
export const getAuthErrorDetails = (error: unknown) => {
  if (isAuthError(error)) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: 'Unknown error',
    error: String(error),
  };
};

/**
 * Helper function to safely parse JWT payload (client-side only)
 * Note: This is for convenience only, never trust client-side JWT parsing for security decisions
 * @param token - JWT token to parse
 * @returns Parsed payload or null if invalid
 */
export const parseJWTPayload = (token: string): any | null => {
  if (typeof globalThis.window === 'undefined') {
    console.warn('parseJWTPayload should only be used client-side');
    return null;
  }

  try {
    if (!token?.trim()) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;

    const decoded = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

/**
 * Helper function to check if a token is expired (client-side only)
 * Note: This is for convenience only, never trust client-side validation for security decisions
 * @param token - JWT token to check
 * @returns boolean indicating if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const payload = parseJWTPayload(token);
  if (!payload?.exp) return true;

  return Date.now() >= payload.exp * 1000;
};
