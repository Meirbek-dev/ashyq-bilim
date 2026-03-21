'use client';

import { PlatformContextProvider } from '@/components/Contexts/PlatformContext';
import type { ReactNode } from 'react';

export default function PlatformProvider({
  children,
  initialPlatform,
}: {
  children: ReactNode;
  initialPlatform?: unknown;
}) {
  return <PlatformContextProvider initialPlatform={initialPlatform}>{children}</PlatformContextProvider>;
}
