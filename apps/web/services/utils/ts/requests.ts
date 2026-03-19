type FetchCacheConfig =
  | {
      revalidate?: number | null | undefined;
      tags?: string[];
      cache?: RequestCache | null | undefined;
      [key: string]: any;
    }
  | undefined;

const sanitizeFetchConfig = (config: FetchCacheConfig): { next?: Record<string, any>; cache?: RequestCache } => {
  if (!config) return {};

  const sanitized: Record<string, any> = { ...config };
  let cache: RequestCache | undefined;

  if ('cache' in sanitized) {
    const cacheValue = sanitized.cache;
    if (cacheValue === 'no-store' || cacheValue === 'force-cache' || cacheValue === 'only-if-cached') {
      cache = cacheValue;
    }
    delete sanitized.cache;
  }

  if (sanitized.revalidate !== undefined && sanitized.revalidate !== null) {
    const parsed = Number(sanitized.revalidate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      cache = 'no-store';
      delete sanitized.revalidate;
    } else {
      sanitized.revalidate = parsed;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return cache ? { cache } : {};
  }

  return cache ? { next: sanitized, cache } : { next: sanitized };
};

// Internal helper to create request options, reducing code duplication.
const createRequestInit = (
  method: string,
  config: {
    data?: any;
    token?: string;
    next?: any;
    isJson?: boolean;
    // When true, only adds a body for POST, PUT, or DELETE methods.
    limitBodyToMethods?: boolean;
  },
): RequestInit & { next?: any } => {
  const { data, token, next, isJson = true, limitBodyToMethods = false } = config;

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const options: RequestInit & { next?: any } = {
    method,
    redirect: 'follow',
    credentials: 'include',
    headers,
  };

  const { next: sanitizedNext, cache } = sanitizeFetchConfig(next);
  if (cache) {
    options.cache = cache;
  }
  if (sanitizedNext) {
    options.next = sanitizedNext;
  }

  // Only set JSON content-type when sending a body (avoid preflight on simple GET/HEAD)
  if (isJson && data !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const shouldSetBody = data !== null && (!limitBodyToMethods || ['POST', 'PUT', 'DELETE'].includes(method));

  if (shouldSetBody) {
    options.body = isJson ? JSON.stringify(data) : data;
  }

  return options;
};

// --- EXPORTED FUNCTIONS (UNCHANGED SIGNATURES) ---

export const RequestBody = (method: string, data: any, next: any) => {
  return createRequestInit(method, { data, next });
};

export const RequestBodyWithAuthHeader = (method: string, data: any, next: any, token?: string) => {
  return createRequestInit(method, {
    data,
    next,
    token,
    limitBodyToMethods: true,
  });
};

/**
 * Note: This function stringifies the body but does not set the
 * 'Content-Type': 'application/json' header. This behavior is preserved
 * for backwards compatibility but may be unintended.
 */
export const RequestBodyForm = (method: string, data: any, next: any) => {
  const options: RequestInit & { next?: any } = {
    method,
    headers: {},
    redirect: 'follow',
    credentials: 'include',
  };

  const { next: sanitizedNext, cache } = sanitizeFetchConfig(next);
  if (cache) {
    options.cache = cache;
  }
  if (sanitizedNext) {
    options.next = sanitizedNext;
  }

  if (method === 'POST' || method === 'PUT') {
    options.body = JSON.stringify(data);
  }
  return options;
};

export const RequestBodyFormWithAuthHeader = (method: string, data: any, next: any, access_token: string) => {
  // Handles FormData, so isJson is false.
  return createRequestInit(method, {
    data,
    next,
    token: access_token,
    isJson: false,
  });
};

export const swrFetcher = async (url: string, token?: string) => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const options: RequestInit = {
    method: 'GET',
    headers,
    redirect: 'follow',
    credentials: 'include',
  };
  const response = await fetch(url, options);
  return errorHandling(response);
};

export const fetchResponseMetadata = async (url: string, token?: string): Promise<CustomResponseTyping> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
    credentials: 'include',
  });

  return getResponseMetadata(response);
};

/**
 * SWR fetcher that returns both data and response headers.
 * Useful for paginated endpoints that return total count in headers.
 */
export const swrFetcherWithHeaders = async (
  url: string,
  token?: string,
): Promise<{ data: any; headers: Record<string, string> }> => {
  const reqHeaders: Record<string, string> = {};
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }
  const options: RequestInit = {
    method: 'GET',
    headers: reqHeaders,
    redirect: 'follow',
    credentials: 'include',
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    const error: any = new Error(response.statusText || 'Request failed');
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const resHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    resHeaders[key.toLowerCase()] = value;
  });
  return { data, headers: resHeaders };
};

export const errorHandling = async (res: Response) => {
  if (!res.ok) {
    let data: any;

    try {
      data = await res.json();
    } catch {
      data = null;
    }

    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail
              .map((item: { msg?: string }) => item?.msg)
              .filter(Boolean)
              .join(', ')
          : res.statusText || 'Request failed';

    const error: any = new Error(detail || 'Request failed');
    error.status = res.status;
    error.data = data;
    error.detail = data?.detail;
    throw error;
  }
  return res.json();
};

export interface CustomResponseTyping {
  success: boolean;
  data: any;
  status: number;
  HTTPmessage: string;
}

export const getResponseMetadata = async (response: Response): Promise<CustomResponseTyping> => {
  let data: any = null;

  // Safely attempt to parse the response body as JSON.
  // This prevents errors if the response is empty (e.g., 204 No Content) or not valid JSON.
  try {
    data = await response.json();
  } catch (error) {
    console.warn('Failed to parse response JSON in getResponseMetadata', {
      status: response.status,
      statusText: response.statusText,
      error,
    });
  }

  return {
    success: response.status === 200,
    data,
    status: response.status,
    HTTPmessage: response.statusText,
  };
};

export const revalidateTags = async (tags: string[]) => {
  const uniqueTags = [...new Set(tags)]
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim());

  if (uniqueTags.length === 0) {
    return;
  }

  const baseUrl = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : '';
  const endpoint = `${baseUrl}/api/revalidate`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags: uniqueTags }),
    });

    if (!response.ok) {
      throw new Error(`Failed to revalidate tags (${response.status})`);
    }
  } catch (error) {
    console.warn('Failed to revalidate tags via POST, falling back to per-tag requests', {
      tags: uniqueTags,
      error,
    });
    await Promise.all(
      uniqueTags.map((tag) => {
        const url = `${endpoint}?tag=${encodeURIComponent(tag)}`;
        return fetch(url, { credentials: 'include' });
      }),
    );
  }
};
