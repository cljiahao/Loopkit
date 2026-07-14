import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const TYPE_ALL = "all";

export function ActivityFilters({
  basePath,
  currentP,
  type,
  from,
  to,
}: {
  basePath: string;
  currentP: string | undefined;
  type: string | undefined;
  from: string | undefined;
  to: string | undefined;
}) {
  const hasActiveFilters = Boolean(type || from || to);
  const clearHref = currentP ? `${basePath}?p=${currentP}` : basePath;

  return (
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
    >
      {currentP && <input type="hidden" name="p" value={currentP} />}
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-type"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Type
        </Label>
        <Select name="type" defaultValue={type ?? TYPE_ALL}>
          <SelectTrigger id="activity-type" className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_ALL}>All</SelectItem>
            <SelectItem value="stamps">Stamps</SelectItem>
            <SelectItem value="rewards">Rewards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-from"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="activity-from"
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-to"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="activity-to"
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="h-9 w-40"
        />
      </div>
      <Button type="submit" variant="outline" className="h-9 rounded-lg">
        Apply filters
      </Button>
      {hasActiveFilters && (
        <a
          href={clearHref}
          className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear filters
        </a>
      )}
    </form>
  );
}
