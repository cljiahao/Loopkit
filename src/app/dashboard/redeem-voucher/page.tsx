import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { getVoucherByToken, type VoucherLookup } from "@/lib/program";
import { BackButton } from "@/components/back-button";
import { RedeemVoucherConfirm } from "@/app/dashboard/redeem-voucher/redeem-voucher-confirm";

function VoucherBody({
  token,
  voucher,
}: {
  token: string;
  voucher: VoucherLookup | null;
}) {
  if (!voucher) {
    return (
      <p className="text-sm text-muted-foreground">
        That code isn&apos;t for this shop.
      </p>
    );
  }
  if (voucher.status !== "active") {
    return (
      <p className="text-sm text-muted-foreground">
        This reward is already {voucher.status}.
      </p>
    );
  }
  return (
    <RedeemVoucherConfirm
      token={token}
      phone={voucher.phone}
      rewardText={voucher.rewardText}
    />
  );
}

export default async function RedeemVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await requireVendor();
  const { token } = await searchParams;
  if (!token) redirect("/dashboard");

  const voucher = await getVoucherByToken(token);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <BackButton href="/dashboard" label="Back to dashboard" />
      <VoucherBody token={token} voucher={voucher} />
    </div>
  );
}
