"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { stampAction } from "@/app/dashboard/actions";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Cashier-assisted enrolment: a phone number is enough. stampAction runs
// add_stamp, which creates the card and lands the first stamp in one call.
// The server action is the real validator; the client check is only a
// format nudge so an obvious typo never round-trips.
export function NewCustomerPanel({
  programId,
  onCreated,
}: {
  programId: string;
  onCreated: (phone: string, card: StampCard) => void;
}) {
  const { pending, run } = useAsyncAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      toast.error("Enter a valid Singapore phone number.");
      return;
    }
    run(async () => {
      const fd = new FormData();
      fd.set("program_id", programId);
      fd.set("phone", phone);
      const res = await stampAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Card created for ${res.card.phone}, first stamp added.`);
      onCreated(res.card.phone, res.card);
      setPhone("");
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        <Label
          htmlFor="new-customer-phone"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Customer phone
        </Label>
        <Input
          ref={inputRef}
          id="new-customer-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="9123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl px-6 font-semibold"
      >
        {pending ? "Creating…" : "Create card and first stamp"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Ask at the till: &ldquo;Want a loyalty card? Just your phone
        number.&rdquo;
      </p>
    </form>
  );
}
