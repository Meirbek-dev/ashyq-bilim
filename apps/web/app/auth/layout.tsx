import PlatformProvider from '@/components/Contexts/PlatformProvider';
import { getPlatformContextInfo } from '@/services/platform/platform';
import { Spinner } from '@components/ui/spinner';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

function AuthContent({ children, initialPlatform }: { children: React.ReactNode; initialPlatform: unknown }) {
  useTranslations('Auth.Layout');
  return <PlatformProvider initialPlatform={initialPlatform}>{children}</PlatformProvider>;
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const initialPlatform = await getPlatformContextInfo();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AuthContent initialPlatform={initialPlatform}>{children}</AuthContent>
    </Suspense>
  );
}
