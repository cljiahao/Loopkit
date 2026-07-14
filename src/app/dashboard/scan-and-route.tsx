"use client";

import { useRouter } from "next/navigation";
import { ScanButton } from "@/app/dashboard/scan-button";

// Program-agnostic entry point: scans any of the vendor's cards and routes
// straight to that card's own program's Counter, phone pre-filled — no
// need to already be on the right program's card to serve a customer.
export function ScanAndRoute() {
  const router = useRouter();
  return (
    <ScanButton
      label="Scan a customer"
      onResolved={({ phone, programId }) => {
        router.push(
          `/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}`,
        );
      }}
    />
  );
}
