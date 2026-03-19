import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container mx-auto space-y-6 py-8">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}
