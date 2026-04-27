function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-navy-800/60 ${className}`} />;
}

export default function MatchCardSkeleton() {
  return (
    <div className="bg-navy-900/50 border border-navy-800/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Pulse className="h-3 w-24" />
        <Pulse className="h-5 w-16 rounded-full" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Pulse className="w-8 h-8 rounded-full" />
          <Pulse className="h-4 w-20" />
        </div>
        <Pulse className="h-5 w-8" />
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Pulse className="h-4 w-20" />
          <Pulse className="w-8 h-8 rounded-full" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-navy-800/40">
        <Pulse className="h-3 w-32" />
        <Pulse className="h-3 w-20" />
      </div>
    </div>
  );
}

export function MatchCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  );
}
