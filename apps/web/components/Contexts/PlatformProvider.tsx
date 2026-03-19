'use client';

import { PlatformContextProvider } from '@/components/Contexts/PlatformContext';
import type { ReactNode } from 'react';

export default function PlatformProvider({ children, initialOrg }: { children: ReactNode; initialOrg?: unknown }) {
  return <PlatformContextProvider initialOrg={initialOrg}>{children}</PlatformContextProvider>;
}
