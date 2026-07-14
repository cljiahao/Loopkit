"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Same-page program switcher for every Stats/Activity/Customers view (merged
// and filtered alike), mirroring qkit's StatsControls: one instant <select>,
// no submit button. Copies the current URL's other params (e.g. Customers'
// `q` search term) forward so switching programs never drops them.
export function ProgramSwitcher({
  programs,
  currentId,
  basePath,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (programs.length <= 1) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("p", value);
    } else {
      params.delete("p");
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <select
      value={currentId}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Switch program"
      className="mb-4 h-9 rounded-lg border bg-card px-3 text-sm"
    >
      <option value="">All programs</option>
      {programs.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
