"use client";

import { useRouter } from "next/navigation";
import type { CustomerSort } from "@/lib/customer-segments";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS: { value: CustomerSort; label: string }[] = [
  { value: "recent", label: "Last visit" },
  { value: "away", label: "Longest away" },
  { value: "progress", label: "Closest to reward" },
];

// Instant sort picker for the vendor-wide Customers list. Pushes `?sort=`
// and keeps the current `q` / `seg` params so switching sort never drops
// the search or the active segment chip. The chips themselves are plain
// server-rendered links; only this onChange navigation needs a client.
export function CustomerControls({
  sort,
  basePath = "/dashboard/customers",
  preservedParams,
}: {
  sort: CustomerSort;
  basePath?: string;
  preservedParams: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(preservedParams)) {
      if (val) params.set(key, val);
    }
    params.set("sort", value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <Select value={sort} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Sort"
        className="h-9 w-auto min-w-[11rem] shrink-0 rounded-lg border bg-card px-3 text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
