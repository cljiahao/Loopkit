"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// The poster prints on its own via the scoped @media print rules in
// ShopJoinPoster; this is just the trigger.
export function PrintPosterButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="rounded-lg print:hidden"
    >
      <Printer className="size-4" />
      Print poster
    </Button>
  );
}
