import { describe, it, expect, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Bricolage_Grotesque: () => ({ variable: "--font-bricolage" }),
  Plus_Jakarta_Sans: () => ({ variable: "--font-jakarta" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));

const { metadata } = await import("./layout");

describe("root layout metadata", () => {
  it("sets the browser-tab title", () => {
    expect(metadata.title).toBe("Loopkit | Loyalty Cards");
  });
});
