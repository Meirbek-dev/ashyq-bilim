/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import {
  SessionProvider,
  broadcastLogout,
  broadcastSessionRefresh,
  useSessionContext,
} from '@/components/providers/session-provider';
import { apiFetch } from '@/lib/api-client';
import type { Session } from '@/lib/auth/types';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

// Mock useRouter
const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
  }),
}));

// Mock useQuery
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useQueryClient: vi.fn(() => ({
      clear: vi.fn(),
    })),
    queryOptions: (opts: any) => opts,
  };
});

// Mock apiFetch
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const mockSession: Session = {
  user: { id: 1, email: 'test@example.com', username: 'test' } as any,
  roles: [],
  permissions: [],
  permissions_timestamp: Date.now(),
  expires_at: Date.now() + 3600,
  session_version: 1,
  expiresAt: Date.now() + 3600000,
  sessionVersion: 1,
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider initialSession={mockSession}>{children}</SessionProvider>
  </QueryClientProvider>
);

describe('Auth Extended Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isError: false,
      isLoading: false,
    } as any);
  });

  it('should trigger router.refresh() when refresh() is called', () => {
    let refreshTrigger: () => void = () => {};
    const TestComponent = () => {
      const { refresh } = useSessionContext();
      refreshTrigger = refresh;
      return null;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    act(() => {
      refreshTrigger();
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('should logout and redirect when a logout broadcast is received', async () => {
    render(
      <Wrapper>
        <div data-testid="auth-content">Authenticated Content</div>
      </Wrapper>,
    );

    expect(screen.getByTestId('auth-content')).toBeDefined();

    // Simulate broadcast message
    act(() => {
      broadcastLogout();
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('should refresh session when a refresh broadcast is received', async () => {
    render(
      <Wrapper>
        <div>Content</div>
      </Wrapper>,
    );

    act(() => {
      broadcastSessionRefresh();
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('should handle auth/me failure by setting status to error', async () => {
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isError: true,
      isLoading: false,
    } as any);

    const TestComponent = () => {
      const { status } = useSessionContext();
      return <div data-testid="status">{status}</div>;
    };

    render(
      <Wrapper>
        <TestComponent />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error');
    });
  });
});
