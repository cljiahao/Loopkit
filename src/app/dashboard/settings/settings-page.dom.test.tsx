// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps", type: "stamp" },
  { id: "p2", name: "Lucky Wheel", type: "wheel" },
];

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
  isPro: vi.fn(async () => false),
}));

const qkitMaybeSingle = vi.fn(
  async (): Promise<{
    data: { program_id: string; enabled: boolean } | null;
  }> => ({ data: null }),
);
const telegramMaybeSingle = vi.fn(
  async (): Promise<{ data: { chat_id: number } | null }> => ({
    data: null,
  }),
);
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle:
            table === "vendor_telegram" ? telegramMaybeSingle : qkitMaybeSingle,
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/telegram-link", () => ({
  getOrCreateTelegramLinkToken: vi.fn(async () => "tok123"),
}));
vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async (text: string) => `<svg data-testid="qr">${text}</svg>`),
}));

vi.mock("@/app/dashboard/qkit-earn-settings", () => ({
  QkitEarnSettings: (props: {
    programs: { id: string; name: string }[];
    current: { programId: string; enabled: boolean } | null;
    isPro: boolean;
  }) => (
    <div data-testid="qkit-earn-settings">
      {props.programs.map((p) => p.name).join(",")} / current:
      {props.current ? props.current.programId : "none"} / pro:
      {String(props.isPro)}
    </div>
  ),
}));

vi.mock("@/app/dashboard/settings/connect-telegram-section", () => ({
  ConnectTelegramSection: (
    props:
      | { connected: true }
      | { connected: false; configured: false }
      | {
          connected: false;
          configured: true;
          qrSvgMarkup: string;
          deepLink: string;
        },
  ) => {
    let label = "not-configured";
    if (props.connected) {
      label = "connected";
    } else if (props.configured) {
      label = `disconnected:${props.deepLink}`;
    }
    return <div data-testid="connect-telegram-section">{label}</div>;
  },
}));

import SettingsPage from "./page";

const ORIGINAL_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

beforeEach(() => {
  qkitMaybeSingle.mockReset().mockResolvedValue({ data: null });
  telegramMaybeSingle.mockReset().mockResolvedValue({ data: null });
});

afterEach(() => {
  process.env.TELEGRAM_BOT_USERNAME = ORIGINAL_BOT_USERNAME;
});

describe("SettingsPage", () => {
  it("renders the heading and only the stamp-type programs, with no existing config", async () => {
    render(await SettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    const panel = screen.getByTestId("qkit-earn-settings");
    expect(panel).toHaveTextContent("Coffee Stamps");
    expect(panel).not.toHaveTextContent("Lucky Wheel");
    expect(panel).toHaveTextContent("current:none");
    expect(panel).toHaveTextContent("pro:false");
  });

  it("passes the existing qkit earn config through when one is already saved", async () => {
    qkitMaybeSingle.mockResolvedValueOnce({
      data: { program_id: "p1", enabled: true },
    });
    const { isPro } = await import("@/lib/program");
    vi.mocked(isPro).mockResolvedValueOnce(true);

    render(await SettingsPage());

    const panel = screen.getByTestId("qkit-earn-settings");
    expect(panel).toHaveTextContent("current:p1");
    expect(panel).toHaveTextContent("pro:true");
  });

  it("shows the Telegram deep-link section when disconnected and a bot is configured", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "LoopkitAlertsBot";
    telegramMaybeSingle.mockResolvedValueOnce({ data: null });

    render(await SettingsPage());

    const panel = screen.getByTestId("connect-telegram-section");
    expect(panel).toHaveTextContent(
      "disconnected:https://t.me/LoopkitAlertsBot?start=tok123",
    );
  });

  it("shows a not-configured Telegram section when no bot username is set", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    telegramMaybeSingle.mockResolvedValueOnce({ data: null });
    const { getOrCreateTelegramLinkToken } =
      await import("@/lib/telegram-link");
    vi.mocked(getOrCreateTelegramLinkToken).mockClear();

    render(await SettingsPage());

    expect(screen.getByTestId("connect-telegram-section")).toHaveTextContent(
      "not-configured",
    );
    expect(getOrCreateTelegramLinkToken).not.toHaveBeenCalled();
  });

  it("shows the Connected Telegram section, skipping token generation, when vendor_telegram has a row", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "LoopkitAlertsBot";
    telegramMaybeSingle.mockResolvedValueOnce({ data: { chat_id: 555 } });
    const { getOrCreateTelegramLinkToken } =
      await import("@/lib/telegram-link");
    vi.mocked(getOrCreateTelegramLinkToken).mockClear();

    render(await SettingsPage());

    expect(screen.getByTestId("connect-telegram-section")).toHaveTextContent(
      "connected",
    );
    expect(getOrCreateTelegramLinkToken).not.toHaveBeenCalled();
  });
});
