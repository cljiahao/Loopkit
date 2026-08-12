// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({
    user: {
      id: "v1",
      email: "vendor@business.sg",
      user_metadata: { display_name: "Vendor Vee", avatar_url: null },
    },
  })),
}));
vi.mock("@/lib/vendor", () => ({
  getVendorProfile: vi.fn(async () => ({ name: "Kopi Corner" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: vi.fn(async () => ({
    vendor_id: "v1",
    stall_name: "Kopi Corner",
    social_links: { website: "https://kopicorner.com" },
    created_at: "",
    updated_at: "",
  })),
}));
vi.mock("@/app/dashboard/profile/profile-form", () => ({
  ProfileForm: (props: {
    email: string;
    name: string | null;
    socialLinks: Record<string, string>;
  }) => (
    <div data-testid="profile-form">
      {props.email} / {props.name} / {Object.keys(props.socialLinks).join(",")}
    </div>
  ),
}));

import ProfilePage from "./page";

describe("ProfilePage", () => {
  it("renders the heading and passes the vendor's profile and social links to ProfileForm", async () => {
    render(await ProfilePage());

    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile-form")).toHaveTextContent(
      "vendor@business.sg / Kopi Corner / website",
    );
  });

  it("degrades to empty social links when the shared merqo profile read fails", async () => {
    const { getOrCreateVendorProfile } =
      await import("@/lib/merqo-vendor-profile");
    vi.mocked(getOrCreateVendorProfile).mockRejectedValueOnce(
      new Error("merqo down"),
    );

    render(await ProfilePage());

    expect(screen.getByTestId("profile-form")).toHaveTextContent(
      "vendor@business.sg / Kopi Corner /",
    );
  });
});
