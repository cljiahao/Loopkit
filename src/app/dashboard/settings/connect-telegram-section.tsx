"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { disconnectTelegramAction } from "@/app/dashboard/actions";
import { ElevatedCard } from "@/components/elevated-card";
import { Button } from "@/components/ui/button";

type Props =
  | { connected: true }
  | { connected: false; configured: false }
  | {
      connected: false;
      configured: true;
      qrSvgMarkup: string;
      deepLink: string;
    };

/** Dashboard settings "Connect Telegram" section: deep-link QR + link when
 * disconnected, a "Connected" state with a disconnect action once
 * `vendor_telegram` has a row. Redemption alerts are sent by `redeemAction`
 * once linked — this component only handles the one-time linking UI. */
export function ConnectTelegramSection(props: Props) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  if (props.connected) {
    return (
      <ElevatedCard className="space-y-3 p-4">
        <p className="text-sm font-medium">Telegram connected</p>
        <p className="text-sm text-muted-foreground">
          You&rsquo;ll get a message here on every reward redemption.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await disconnectTelegramAction();
              if (!result.success) {
                toast.error(result.error);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "Disconnecting…" : "Disconnect"}
        </Button>
      </ElevatedCard>
    );
  }

  if (!props.configured) {
    return (
      <ElevatedCard className="p-4 text-sm text-muted-foreground">
        Telegram alerts are not set up yet for this shop.
      </ElevatedCard>
    );
  }

  return (
    <ElevatedCard className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center">
      <div
        className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-20"
        dangerouslySetInnerHTML={{ __html: props.qrSvgMarkup }}
      />
      <div className="min-w-0 w-full flex-1 space-y-2">
        <p className="text-sm font-medium">
          Scan to get a Telegram message every time a reward is redeemed.
        </p>
        <a
          href={props.deepLink}
          target="_blank"
          rel="noreferrer"
          className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs"
        >
          {props.deepLink}
        </a>
      </div>
    </ElevatedCard>
  );
}
