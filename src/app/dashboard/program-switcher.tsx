// Same-page program switcher for Stats/Activity's filtered (?p=) view —
// mirrors Customers' existing inline picker (customers/page.tsx), pulled
// into a shared component since two pages need it identically. A plain GET
// form; no client JS needed.
export function ProgramSwitcher({
  programs,
  currentId,
  action,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  action: string;
}) {
  if (programs.length <= 1) return null;

  return (
    <form action={action} method="get" className="mb-4 flex items-center gap-2">
      <select
        name="p"
        defaultValue={currentId}
        aria-label="Switch program"
        className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
      >
        {programs.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
      >
        Switch
      </button>
    </form>
  );
}
