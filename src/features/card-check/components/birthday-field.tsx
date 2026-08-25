"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCustomerBirthdayAction } from "../api/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// Optional, self-entered, once — some vendors give a small birthday bonus
// (loopkit.programs.birthday_bonus_enabled, migration 0041); this field
// never says whether a given shop actually does, since that's a per-vendor,
// per-program toggle this page has no visibility into.
export function BirthdayField({
  vendorId,
  phone,
}: {
  vendorId: string;
  phone: string;
}) {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!month || !day) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("vendor", vendorId);
      fd.set("phone", phone);
      fd.set("month", month);
      fd.set("day", day);
      const res = await setCustomerBirthdayAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSaved(true);
      toast.success("Thanks — we'll remember your birthday.");
    });
  }

  if (saved) {
    return <p className="text-xs text-muted-foreground">Birthday saved.</p>;
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Label
        htmlFor="birthday-month"
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Birthday (optional)
      </Label>
      <div className="flex gap-2">
        <select
          id="birthday-month"
          aria-label="Birth month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 flex-1 rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label="Birth day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="h-10 w-20 rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">Day</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!month || !day || pending}
        onClick={save}
        className="rounded-lg"
      >
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
