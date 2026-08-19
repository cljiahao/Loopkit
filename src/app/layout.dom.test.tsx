// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "--font-fraunces" }),
  Plus_Jakarta_Sans: () => ({ variable: "--font-jakarta" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));

const { themeProviderMock } = vi.hoisted(() => ({
  themeProviderMock: vi.fn(),
}));

vi.mock("next-themes", () => ({
  ThemeProvider: (props: {
    children: React.ReactNode;
    attribute: string;
    defaultTheme: string;
    enableSystem: boolean;
    disableTransitionOnChange: boolean;
  }) => {
    themeProviderMock(props);
    return <div data-testid="theme-provider">{props.children}</div>;
  },
}));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  it("wraps the app tree in next-themes' ThemeProvider, configured for the account menu's theme toggle", () => {
    render(
      <RootLayout>
        <div data-testid="child">content</div>
      </RootLayout>,
    );

    const provider = screen.getByTestId("theme-provider");
    expect(provider).toContainElement(screen.getByTestId("child"));
    expect(themeProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attribute: "class",
        defaultTheme: "system",
        enableSystem: true,
        disableTransitionOnChange: true,
      }),
    );
  });
});
