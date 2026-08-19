import type { ReactElement } from "react";

// "Sealing Wax" marks, approximated from the OKLCH theme tokens as
// concrete hex — ImageResponse needs literal CSS colors, it can't
// consume the app's OKLCH custom properties. (Named BRAND_MULBERRY in
// docs/business/2026-07-21-brand-icon-family-standard.md's "Source token"
// column, written against an even earlier theme — that table is now stale.)
export const BRAND_RASPBERRY = "#a8002c";
export const BRAND_BLUSH = "#fcf3ed";

/**
 * The loopkit "L" app mark for ImageResponse-generated icons. Same
 * construction formula as every other kit's brand-icon (see
 * docs/business/2026-07-21-brand-icon-family-standard.md): fontSize
 * size*0.62, borderRadius size*0.22, fontWeight 700 — only color/letter
 * differ per product. loopkit's display font is Fraunces (shared family
 * face, see docs/business/2026-08-13-typography-family-standard.md), a
 * serif, so this uses the same Georgia stand-in as qkit.
 */
export function brandIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_RASPBERRY,
        color: BRAND_BLUSH,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        borderRadius: size * 0.22,
      }}
    >
      L
    </div>
  );
}
