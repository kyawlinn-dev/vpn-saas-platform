import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = () => setMatches(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function TablePagination({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
}) {
  const narrow = useMediaQuery("(max-width: 599px)");

  const pages = useMemo(() => {
    if (count <= 1) return [1];
    const siblings = narrow ? 1 : 2;
    const items: (number | "...")[] = [];
    const left = Math.max(2, page - siblings);
    const right = Math.min(count - 1, page + siblings);

    items.push(1);
    if (left > 2) items.push("...");
    for (let i = left; i <= right; i++) items.push(i);
    if (right < count - 1) items.push("...");
    if (count > 1) items.push(count);

    return items;
  }, [page, count, narrow]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
        Prev
      </Button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-1 text-sm text-muted-foreground select-none">
            …
          </span>
        ) : (
          <Button
            key={p}
            size="sm"
            variant={page === p ? "primary" : "outline"}
            className="min-w-9"
            onClick={() => onChange(p as number)}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={page === count || count <= 1}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
