'use client';

import NavBar from '@/components/Objects/Menus/nav-menu';
import type { ReactNode } from 'react';

interface WithMenuClientLayoutProps {
  children: ReactNode;
}

export default function WithMenuClientLayout({ children }: WithMenuClientLayoutProps) {
  return (
    <>
      <NavBar />
      <div className="h-[52px]" />
      {children}
    </>
  );
}
