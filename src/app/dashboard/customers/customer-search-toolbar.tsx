import { ProgramSwitcher } from "../program-switcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function CustomerSearchToolbar({
  programs,
  currentId,
  query,
  cohort,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  query?: string;
  cohort?: string;
}) {
  const scopeSearchId = currentId
    ? "customers-search-program"
    : "customers-search-vendor";
  const searchId = cohort ? "customers-search-cohort" : scopeSearchId;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-auto">
        <ProgramSwitcher
          programs={programs}
          currentId={currentId}
          basePath="/dashboard/customers"
        />
      </div>
      <form
        className="flex w-full min-w-0 flex-1 items-center gap-3 sm:w-auto"
        action="/dashboard/customers"
      >
        {currentId && <input type="hidden" name="p" value={currentId} />}
        {cohort && <input type="hidden" name="cohort" value={cohort} />}
        <Label htmlFor={searchId} className="sr-only">
          Search by phone
        </Label>
        <Input
          id={searchId}
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search by phone"
          className="h-11 min-w-0 rounded-xl"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 shrink-0 rounded-xl px-6"
        >
          Search
        </Button>
      </form>
    </div>
  );
}
