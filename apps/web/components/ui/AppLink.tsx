import NextLink from 'next/link';
import type React from 'react';

// Thin wrapper around next/link to opt out of automatic prefetching by default.
// Prefetching many routes at once (for example, when rendering lots of cards/menus)
// can cause a large number of concurrent requests for Next.js chunks. Setting
// prefetch to false here reduces background chunk downloads and avoids hitting
// rate limits on intermediaries.
type AppLinkProps = React.ComponentProps<typeof NextLink> & { prefetch?: boolean };

export default function AppLink({ prefetch = false, children, ...rest }: AppLinkProps) {
  return (
    <NextLink
      prefetch={prefetch}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
