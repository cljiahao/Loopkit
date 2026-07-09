"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { resolveUpgradeRequest } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

/** Per-row Grant Pro control for a pending upgrade request. */
export function ResolveUpgradeRequestButton({
  requestId,
  vendorId,
  email,
}: {
  requestId: string;
  vendorId: string;
  email: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const who = email ?? "vendor";

  function grant() {
    run(async () => {
      const fd = new FormData();
      fd.set("requestId", requestId);
      fd.set("vendorId", vendorId);
      const result = await resolveUpgradeRequest(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${who} is now Pro.`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={grant}
      className="rounded-xl"
    >
      {pending ? "Granting…" : "Grant Pro"}
    </Button>
  );
}
