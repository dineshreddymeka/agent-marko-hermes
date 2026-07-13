import { cn } from '@app/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-md bg-canvas-inset motion-safe:skeleton-shimmer', className)}
      aria-hidden
    />
  )
}

export function MessageSkeletonList() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 px-4 py-8">
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-48 rounded-2xl" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <Skeleton className="h-16 w-64 rounded-2xl" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <Skeleton className="h-24 w-72 rounded-2xl" />
      </div>
    </div>
  )
}
