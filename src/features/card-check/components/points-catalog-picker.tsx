"use client";

import { useState } from "react";
import { toast } from "sonner";
import { selectPointsRewardAction } from "../api/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CatalogItem = { id: string; label: string; cost: number };
type NewVoucher = { id: string; rewardText: string; qr: string };

// Only ever passed the already-affordable subset of a program's catalog
// (program-card-status.tsx filters); renders nothing at all rather than a
// permanently-disabled list when none are affordable yet.
export function PointsCatalogPicker({
  programId,
  phone,
  items,
  onSelected,
}: {
  programId: string;
  phone: string;
  items: CatalogItem[];
  onSelected: (voucher: NewVoucher) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0) return null;

  function confirm(item: CatalogItem) {
    setSubmitting(true);
    (async () => {
      const fd = new FormData();
      fd.set("phone", phone);
      fd.set("program", programId);
      fd.set("item_id", item.id);
      const res = await selectPointsRewardAction(fd);
      setSubmitting(false);
      setPendingId(null);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.rewardText} redeemed — show the QR to the shop.`);
      onSelected({ id: res.id, rewardText: res.rewardText, qr: res.qr });
    })();
  }

  return (
    <div className="w-full space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Choose your reward
      </p>
      {items.map((item) => (
        <AlertDialog
          key={item.id}
          open={pendingId === item.id}
          onOpenChange={(open) => setPendingId(open ? item.id : null)}
        >
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between rounded-xl"
            >
              <span>{item.label}</span>
              <span className="text-muted-foreground">{item.cost} pts</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Redeem {item.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                Uses {item.cost} points. Any remaining points stay on your card
                — you&apos;ll get a QR to show the shop.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  confirm(item);
                }}
              >
                {submitting ? "Redeeming…" : "Redeem"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  );
}
