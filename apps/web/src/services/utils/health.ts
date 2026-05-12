import { apiFetch, getResponseMetadata } from '@/lib/api-client';

export async function checkHealth() {
  try {
    const result = await apiFetch('health');
    if (!result.ok) {
      return {
        success: false,
        status: result.status,
        HTTPmessage: result.statusText,
        data: null,
      };
    }
    return getResponseMetadata(result);
  } catch {
    return {
      success: false,
      status: 503,
      HTTPmessage: 'Service unavailable',
      data: null,
    };
  }
}
