import { VisitsBars } from "../visits-bars";

/** Thirty-day visits with a baseline and first/last calendar-day labels. */
export function VisitsChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  return (
    <div>
      <VisitsBars data={data} axisClassName="mt-1.5" rawDateTitles />
    </div>
  );
}
