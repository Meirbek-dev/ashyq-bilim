import WithMenuClientLayout from './with-menu-client-layout';
import '@styles/globals.css';

export default function PlatformWithMenuLayout({ children }: { children: React.ReactNode }) {
  return <WithMenuClientLayout>{children}</WithMenuClientLayout>;
}
