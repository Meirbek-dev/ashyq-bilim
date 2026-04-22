import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '@/lib/api-client';

// Mock the config and auth redirect to avoid side effects
vi.mock('@services/config/config', () => ({
  getAPIUrl: () => 'http://localhost:8000/api/v1/',
  getServerAPIUrl: () => 'http://api:8000/api/v1/',
}));

vi.mock('@/lib/auth/redirect', () => ({
  buildLoginRedirect: () => '/login',
  isAuthRoute: () => false,
}));

describe('apiFetch timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // We need to global.fetch because Vitest/jsdom might not have it or it's a stub
    global.fetch = vi.fn();
  });

  it('should abort the request when it exceeds DEFAULT_TIMEOUT_MS', async () => {
    // Mock fetch to never resolve
    (global.fetch as any).mockImplementation(() => new Promise((resolve) => {
        // Just hang
    }));

    // We can't easily wait 15 seconds in a unit test, 
    // but we can check if the signal is passed correctly.
    const fetchPromise = apiFetch('test-endpoint');
    
    // Fast-forward time
    vi.useFakeTimers();
    
    const promise = apiFetch('test-endpoint');
    
    // Move forward by 16 seconds
    await vi.advanceTimersByTimeAsync(16000);
    
    await expect(promise).rejects.toThrow();
    
    const lastCall = (global.fetch as any).mock.calls[0];
    const signal = lastCall[1].signal;
    expect(signal.aborted).toBe(true);
    
    vi.useRealTimers();
  });

  it('should resolve normally if within timeout', async () => {
    (global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    
    const response = await apiFetch('test-endpoint');
    const data = await response.json();
    
    expect(data.ok).toBe(true);
  });
});
