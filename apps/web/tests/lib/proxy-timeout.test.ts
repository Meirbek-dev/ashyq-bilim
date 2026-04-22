import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jwtVerify } from 'jose';

// Mock 'jose'
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
  errors: {
    JWTExpired: class extends Error {},
  },
}));

// Mock other dependencies
vi.mock('./lib/auth/cookie-bridge', () => ({
  isAccessTokenExpired: vi.fn(),
}));

// Import the function after mocks
import { verifyTokenSignature } from '@/proxy';

describe('verifyTokenSignature timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should return false when jwtVerify takes too long', async () => {
    // Mock jwtVerify to hang
    (jwtVerify as any).mockImplementation(() => new Promise((resolve) => {
      // Never resolve
    }));

    const verifyPromise = verifyTokenSignature('test-token');
    
    // Fast forward 6 seconds (timeout is 5s)
    await vi.advanceTimersByTimeAsync(6000);
    
    const result = await verifyPromise;
    expect(result).toBe(false);
  });

  it('should return true when jwtVerify resolves quickly', async () => {
    (jwtVerify as any).mockResolvedValue({ payload: {} });
    
    const result = await verifyTokenSignature('test-token');
    expect(result).toBe(true);
  });
});
