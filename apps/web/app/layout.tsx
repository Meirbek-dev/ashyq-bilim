import { getLocale, getMessages, setRequestLocale } from 'next-intl/server';
import { IntlProvider } from '@/components/providers/IntlProvider';
import DevScriptLoader from '@/components/DevScriptLoader';
import { getSession } from '@/lib/auth/session';
import { inter, jetBrainsMono } from '@/lib/fonts';
import { DEFAULT_THEME_MODE, DEFAULT_THEME_NAME, getTheme } from '@/lib/themes';
import type { CSSProperties } from 'react';
import { Suspense } from 'react';
import RootProviders from './root-providers';

import '@styles/globals.css';

const isDevEnv = process.env.NODE_ENV !== 'production';

function getThemeStyle(theme: ReturnType<typeof getTheme>): CSSProperties {
  return {
    colorScheme: theme.resolvedTheme,
    ...Object.fromEntries(Object.entries(theme.tokens).map(([key, value]) => [`--${key}`, value])),
  };
}

async function LocalizedApp({ children }: { children: React.ReactNode }) {
  const [locale, messages, initialSession] = await Promise.all([getLocale(), getMessages(), getSession()]);

  setRequestLocale(locale);

  return (
    <IntlProvider
      messages={messages}
      locale={locale}
    >
      <RootProviders initialSession={initialSession}>
        <main>{children}</main>
      </RootProviders>
    </IntlProvider>
  );
}

const initialTheme = getTheme(DEFAULT_THEME_NAME, DEFAULT_THEME_MODE);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${jetBrainsMono.variable}`}
      data-mode={initialTheme.resolvedTheme}
      data-theme={initialTheme.name}
      lang="ru-RU"
      style={getThemeStyle(initialTheme)}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </head>

      <body suppressHydrationWarning>
        {isDevEnv && <DevScriptLoader />}
        <Suspense fallback={null}>
          <LocalizedApp>{children}</LocalizedApp>
        </Suspense>
      </body>
    </html>
  );
}
