import { describe, it, expect } from "vitest";
import { qrSvg } from "@/lib/qr";

describe("qrSvg", () => {
  it("produces an svg for a token", async () => {
    const svg = await qrSvg("abc123");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
