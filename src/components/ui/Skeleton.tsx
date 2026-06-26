/**
 * Skeleton — shimmer placeholder component.
 * Use `<Skeleton className="h-4 w-32 rounded" />` for individual bars,
 * or compose into purpose-built skeletons below.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 dark:via-white/10 to-transparent" />
    </div>
  )
}

/** 3 order-card skeletons — used on FactoryPendingPage & history pages */
export function OrderCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          {/* Progress bar */}
          <Skeleton className="h-2 w-full rounded-full" />
          {/* Detail rows */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Product grid skeletons — used on ShopAvailablePage */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
        >
          {/* Image placeholder */}
          <Skeleton className="h-40 w-full rounded-none" />
          <div className="p-4 space-y-2.5">
            <Skeleton className="h-4 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <div className="flex items-center justify-between pt-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Stat-card skeletons — used on ShopDashboardPage */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-7 w-14 rounded-md" />
              <Skeleton className="h-2.5 w-28 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
