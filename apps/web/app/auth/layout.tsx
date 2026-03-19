import { getPlatformOrganizationContextInfo } from '@/services/platform/platform';
import PlatformProvider from '@/components/Contexts/PlatformProvider';
import { Spinner } from '@components/ui/spinner';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

function AuthContent({ children, initialOrg }: { children: React.ReactNode; initialOrg: unknown }) {
  useTranslations('Auth.Layout');
  return <PlatformProvider initialOrg={initialOrg}>{children}</PlatformProvider>;
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const initialOrg = await getPlatformOrganizationContextInfo();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <AuthContent initialOrg={initialOrg}>{children}</AuthContent>
    </Suspense>
  );
}
