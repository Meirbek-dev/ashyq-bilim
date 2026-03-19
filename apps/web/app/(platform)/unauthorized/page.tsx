import Link from '@components/ui/AppLink';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Unauthorized</h1>
        <p className="text-muted-foreground mt-3 text-sm">You do not have permission to access this page.</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
