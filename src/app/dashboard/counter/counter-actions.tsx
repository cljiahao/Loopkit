"use client";

import { useState } from "react";
import { NewCustomerPanel } from "@/app/dashboard/counter/new-customer-panel";
import { ShopJoinPoster } from "@/app/dashboard/counter/shop-join-poster";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";

// The "New customer" / "Shop join QR" row under the scan hero. One panel open
// at a time; creating a customer closes the row.
export function CounterActions({
  programId,
  shopName,
  shopJoinQrSvg,
  shopJoinLink,
  showBranding = true,
  onCreated,
}: {
  programId: string;
  shopName: string;
  shopJoinQrSvg: string;
  shopJoinLink: string;
  showBranding?: boolean;
  onCreated: (phone: string, card: StampCard) => void;
}) {
  const [open, setOpen] = useState<"new" | "qr" | null>(null);

  function toggle(panel: "new" | "qr") {
    setOpen((cur) => (cur === panel ? null : panel));
  }

  function handleCreated(phone: string, card: StampCard) {
    setOpen(null);
    onCreated(phone, card);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={open === "new" ? "default" : "outline"}
          aria-expanded={open === "new"}
          onClick={() => toggle("new")}
          className="h-11 rounded-xl font-semibold"
        >
          New customer
        </Button>
        <Button
          type="button"
          variant={open === "qr" ? "default" : "outline"}
          aria-expanded={open === "qr"}
          onClick={() => toggle("qr")}
          className="h-11 rounded-xl font-semibold"
        >
          Shop join QR
        </Button>
      </div>

      {open === "new" && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <NewCustomerPanel programId={programId} onCreated={handleCreated} />
        </div>
      )}

      {open === "qr" && (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Print this and leave it on the counter. Customers scan to join with
            just their phone number.
          </p>
          <ShopJoinPoster
            shopName={shopName}
            qrSvgMarkup={shopJoinQrSvg}
            link={shopJoinLink}
            showBranding={showBranding}
          />
        </div>
      )}
    </div>
  );
}
