'use client';

import React from 'react';

interface ExamLayoutProps {
  title?: string;
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export default function ExamLayout({ title, children, sidebar }: ExamLayoutProps) {
  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,320px]">
        <main>{children}</main>

        <aside className="hidden lg:block">{sidebar}</aside>
      </div>
    </div>
  );
}
