function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-navy-800/60 ${className}`} />;
}

export default function MatchDetailSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="bg-gradient-to-b from-navy-900 to-navy-950 py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <Pulse className="w-16 h-16 rounded-full" />
              <Pulse className="h-4 w-24" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Pulse className="h-8 w-16" />
              <Pulse className="h-3 w-12" />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Pulse className="w-16 h-16 rounded-full" />
              <Pulse className="h-4 w-24" />
            </div>
          </div>
          <div className="flex justify-center mt-4 gap-4">
            <Pulse className="h-3 w-32" />
            <Pulse className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="max-w-5xl mx-auto px-4 flex gap-6">
        <Pulse className="h-4 w-32" />
        <Pulse className="h-4 w-28" />
        <Pulse className="h-4 w-24" />
      </div>

      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 space-y-4">
        <Pulse className="h-6 w-48" />
        <Pulse className="h-24 w-full" />
        <Pulse className="h-24 w-full" />
      </div>
    </div>
  );
}
