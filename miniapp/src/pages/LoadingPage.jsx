import { cn } from "@/lib/utils";

function Shimmer({ className }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-secondary/60", className)} />
  );
}

function CardSkeleton({ tall = false }) {
  return (
    <div className="glass rounded-[22px] p-4">
      <div className="mb-3 flex items-center gap-3">
        <Shimmer className="h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3 w-1/2" />
          <Shimmer className="h-4 w-3/4" />
        </div>
      </div>
      <Shimmer className={tall ? "h-24" : "h-12"} />
      <Shimmer className="mt-3 h-10" />
    </div>
  );
}

export default function LoadingPage() {
  return (
    <div className="grid gap-4 px-4 pt-4">
      <CardSkeleton tall />
      <CardSkeleton />
      <div className="grid grid-cols-2 gap-3">
        <Shimmer className="h-12" />
        <Shimmer className="h-12" />
      </div>
    </div>
  );
}
