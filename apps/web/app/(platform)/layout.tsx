import { getPlatformContextInfo } from '@/services/platform/platform';
import PlatformClientProviders from './platform-client-providers';
import '@styles/globals.css';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const initialPlatform = await getPlatformContextInfo();

  return <PlatformClientProviders initialPlatform={initialPlatform}>{children}</PlatformClientProviders>;
}
