import { cn } from "./cn";

type SkeletonLineProps = {
  className?: string;
};

export function SkeletonLine({ className }: SkeletonLineProps) {
  return (
    <div
      className={cn(
        "h-4 animate-pulse rounded bg-gray-200",
        className,
      )}
    />
  );
}

type SkeletonCardProps = {
  lines?: number;
  className?: string;
};

export function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-3",
        className,
      )}
    >
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine
          key={i}
          className={i === 0 ? "h-5 w-1/3" : i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}
