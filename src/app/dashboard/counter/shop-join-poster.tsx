import { PrintPosterButton } from "@/app/dashboard/counter/print-poster-button";

// A printable "join our loyalty card" poster over the vendor-wide join link
// (/c?v=<vendorId>), the same target ShopQrBlock encodes. Forced white on
// black so a dark-mode vendor still prints a white sheet. The scoped @media
// print block hides the rest of the Counter page so only the poster prints.
export function ShopJoinPoster({
  shopName,
  qrSvgMarkup,
  link,
}: {
  shopName: string;
  qrSvgMarkup: string;
  link: string;
}) {
  return (
    <div className="space-y-3">
      <style>{PRINT_CSS}</style>
      <div
        id="shop-join-poster"
        className="mx-auto max-w-sm rounded-2xl border bg-white p-8 text-center text-black"
      >
        <p className="text-lg font-bold tracking-tight">{shopName}</p>
        <p className="mt-1 text-sm font-medium text-neutral-600">
          Join our loyalty card
        </p>
        <div
          className="mx-auto mt-5 w-44 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
        />
        <p className="mt-5 text-sm font-semibold">
          Scan to join. Just your phone number.
        </p>
        <p className="mt-4 text-xs text-neutral-500">via LoopKit</p>
        <code className="mt-2 block truncate text-[10px] text-neutral-400">
          {link}
        </code>
      </div>
      <PrintPosterButton />
    </div>
  );
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #shop-join-poster, #shop-join-poster * { visibility: visible; }
  #shop-join-poster {
    position: absolute;
    inset: 0;
    margin: auto;
    border: none;
    height: max-content;
  }
}
`;
