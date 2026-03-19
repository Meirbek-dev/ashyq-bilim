'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';

interface IntlProviderProps {
  children: React.ReactNode;
  messages: AbstractIntlMessages;
  locale: string;
}

export function IntlProvider({ children, messages, locale }: IntlProviderProps) {
  // Stable initial time - only created once on mount
  const [now] = useState(() => new Date());

  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
      now={now}
    >
      {children}
    </NextIntlClientProvider>
  );
}
