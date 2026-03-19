import { getLocale, getMessages, setRequestLocale } from 'next-intl/server';
import { IntlProvider } from '@/components/providers/IntlProvider';
import DevScriptLoader from '@/components/DevScriptLoader';
import { inter, jetBrainsMono } from '@/lib/fonts';
import ClientLayout from './client-layout';
import { isDevEnv } from '@/auth';
import { Suspense } from 'react';

import '@styles/globals.css';

async function LocalizedLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <IntlProvider
      messages={messages}
      locale={locale}
    >
      <ClientLayout>{children}</ClientLayout>
    </IntlProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${jetBrainsMono.variable}`}
      lang="ru"
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </head>

      {/* Dev-only non-blocking script loader (client-side) */}
      {isDevEnv && <DevScriptLoader />}
      <body className="bg-background/20">
        <Suspense fallback={null}>
          <LocalizedLayout>{children}</LocalizedLayout>
        </Suspense>
      </body>
    </html>
  );
}
