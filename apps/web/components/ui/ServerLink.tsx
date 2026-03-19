import NextLink from 'next/link';
import React from 'react';

// Server-side wrapper for Next.js Link that disables prefetch by default.
// This allows server components to opt-out of route prefetching without
// importing a client component (which would force a client boundary).
type ServerLinkProps = React.ComponentProps<typeof NextLink> & { prefetch?: boolean };

export default function ServerLink({ prefetch = false, children, ...rest }: ServerLinkProps) {
  return (
    <NextLink
      prefetch={prefetch}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
