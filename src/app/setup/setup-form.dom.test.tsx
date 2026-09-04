// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  saveProgramAction: saveMock,
  changeTypeAction: vi.fn().mockResolvedValue({}),
  prepProgramAction: vi.fn().mockResolvedValue({}),
}));

import { SetupForm } from "@/app/setup/setup-form";
import type { Program } from "@/lib/program";

// Create-flow only: Type/Basics/Rules are step-gated, so most tests below
// need to advance through them to reach a later step's fields. Edit mode
// (isEdit) keeps the original single-page layout and never needs these.
async function goToBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next: Basics" }));
}
async function goToRules(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next: Rules" }));
}

const stampProgram: Program = {
  id: "p1",
  name: "Coffee Stamps",
  stamps_required: 10,
  reward_text: "Free kopi",
  type: "stamp",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  head_start_percent: 20,
  replaced_by: null,
  carry_over_stamps: false,
  birthday_bonus_enabled: false,
};

describe("SetupForm live preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the preview on every keystroke", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getAllByText("0/10 stamps")[0]).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Stamps required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "5");

    expect(screen.getAllByText("0/5 stamps")[0]).toBeInTheDocument();
  });

  it("reflects head-start seeding in the preview when the toggle is on", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByLabelText(/give new customers a head start/i));
    expect(screen.getAllByText("2/10 stamps")[0]).toBeInTheDocument();
  });

  it("still submits the edited controlled field values", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Coffee card");
    expect(submitted.get("reward_text")).toBe("Free kopi");
    expect(submitted.get("stamps_required")).toBe("10");
  });

  it("picking a preset stamp mark submits stamp_mark_mode and stamp_mark_preset", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    // Default type/variant is already stamp/dots, so the "Stamp mark"
    // Section is available once "advanced options" is revealed on Rules.
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(
      screen.getByRole("button", {
        name: "Show advanced options (stamp mark)",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Preset icon" }));
    await user.click(screen.getByRole("button", { name: "star" }));

    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("stamp_mark_mode")).toBe("preset");
    expect(submitted.get("stamp_mark_preset")).toBe("star");
  });
});

describe("SetupForm birthday bonus toggle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is hidden in create mode, even for a stamp program", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.queryByText(/give a bonus stamp on a customer's birthday/i),
    ).not.toBeInTheDocument();
  });

  it("shows unchecked by default in edit mode for a stamp program, and submits true once toggled on", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={stampProgram}
        isEdit={true}
        replacingId={null}
        replacingType={null}
      />,
    );
    const toggle = screen.getByLabelText(
      /give a bonus stamp on a customer's birthday/i,
    );
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("birthday_bonus_enabled")).toBe("true");
  });

  it("reflects an already-enabled program's toggle state", () => {
    render(
      <SetupForm
        program={{ ...stampProgram, birthday_bonus_enabled: true }}
        isEdit={true}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByLabelText(/give a bonus stamp on a customer's birthday/i),
    ).toBeChecked();
  });
});

describe("SetupForm type picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the 4 family tiles on Step 1, no flat 8-tile grid", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Growth" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Points Club" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chance Card" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Flame Club" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spin the Wheel" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a multi-style family (Growth) shows its styles and a Back link", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));

    expect(
      screen.getByRole("button", { name: "Flame Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fill the Cup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Growth" }),
    ).not.toBeInTheDocument();
  });

  it("clicking Back returns to the 4 family tiles", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Growth" })).toBeInTheDocument();
  });

  it("clicking Points Club (single-style) completes selection immediately, with no Step 2", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Points Club" }));

    expect(
      screen.queryByRole("button", { name: "← Back" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Points required")).toBeInTheDocument();
  });

  it("clicking Chance Card shows Spin the Wheel, Scratch Card, and Lucky Tap styles", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));

    expect(
      screen.getByRole("button", { name: "Spin the Wheel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scratch Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
  });

  it("resets name and reward to blank when a new style is picked", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "My card");
    await user.type(screen.getByLabelText("Reward"), "Free item");

    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "Flame Club" }));

    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Reward")).toHaveValue("");
  });

  it("Flame Club style saves type=stamp with variant=flame and the flame-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "Flame Club" }));
    await goToBasics(user);
    expect(screen.getByText("Visits for full blaze")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("flame");
  });

  it("Points Club style saves type=stamp with variant=points, wider range, and points_per_visit", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Points Club" }));
    await goToBasics(user);
    expect(screen.getByText("Points required")).toBeInTheDocument();
    expect(screen.getByLabelText("Points per visit")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Points required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "500");

    const perVisitInput = screen.getByLabelText("Points per visit");
    await user.clear(perVisitInput);
    await user.type(perVisitInput, "20");

    await user.type(screen.getByLabelText("Card name"), "Coffee Points");
    await user.type(screen.getByLabelText("Reward"), "Free drink");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("points");
    expect(submitted.get("stamps_required")).toBe("500");
    expect(submitted.get("points_per_visit")).toBe("20");
  });

  it("Fill the Cup style saves type=plant with variant=cup and the fill-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "Fill the Cup" }));
    await goToBasics(user);
    expect(screen.getByText("Visits to fill")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Fill-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("cup");
  });

  it("Growth family's Sprout style still saves type=plant with variant=plant and the bloom-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "Sprout" }));
    await goToBasics(user);
    expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("plant");
  });

  it("Spin the Wheel style shows segment rows, the odds-weight tooltip, and saves segments", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));
    await user.click(screen.getByRole("button", { name: "Spin the Wheel" }));
    await goToBasics(user);

    expect(screen.getByText("Wheel segments")).toBeInTheDocument();
    expect(screen.getByText("Overall win chance: 17%")).toBeInTheDocument();
    expect(screen.getByText("≈83%")).toBeInTheDocument();
    expect(screen.getByText("≈17%")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "What the number next to each prize means",
      }),
    );
    expect(
      screen.getByText(/higher numbers land more often/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Spin to win");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("wheel");
    expect(JSON.parse(submitted.get("segments") as string)).toHaveLength(2);
  });

  it("Scratch Card style shows the cover picker and submits the chosen style", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));
    await user.click(screen.getByRole("button", { name: "Scratch Card" }));
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Lucky scratch");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);

    expect(screen.getByText("Scratch cover")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Sealing wax" }));
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("scratch");
    expect(submitted.get("scratch_cover_style")).toBe("wax");
  });

  it("stamp quick-pick chips set stamps required", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    await user.click(screen.getByRole("button", { name: "15" }));
    expect(screen.getByLabelText("Stamps required")).toHaveValue(15);
    expect(screen.getAllByText("0/15 stamps")[0]).toBeInTheDocument();
  });

  it("shows the type-picker heading and both card-details cards", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Choose a card type")).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
  });

  it("edit mode shows the locked type label and preview together, no picker", () => {
    render(
      <SetupForm
        program={
          {
            id: "p1",
            name: "Coffee card",
            stamps_required: 10,
            reward_text: "Free kopi",
            type: "stamp",
            config: {},
            active: true,
            head_start: false,
            replaced_by: null,
            carry_over_stamps: false,
          } as never
        }
        isEdit
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Stamp card")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lucky Tap" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("0/10 stamps")[0]).toBeInTheDocument();
  });

  it("shows the head-start percent input only for stamp/plant with the toggle on, and submits it", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await goToRules(user);
    expect(
      screen.queryByLabelText("Head start amount"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/give new customers a head start/i));
    const percentInput = screen.getByLabelText("Head start amount");
    expect(percentInput).toHaveValue(20);

    await user.clear(percentInput);
    await user.type(percentInput, "35");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("head_start_percent")).toBe("35");
  });
});

describe("SetupForm create-flow step wizard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the 3-step indicator and step 1's Next button, but no Back/Rules content yet", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("1. Type")).toBeInTheDocument();
    expect(screen.getByText("2. Basics")).toBeInTheDocument();
    expect(screen.getByText("3. Rules")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next: Basics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create card" }),
    ).not.toBeInTheDocument();
  });

  it("disables Next: Rules until a card name is entered, then enables it", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    expect(screen.getByRole("button", { name: "Next: Rules" })).toBeDisabled();

    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    expect(screen.getByRole("button", { name: "Next: Rules" })).toBeEnabled();
  });

  it("going Back from Basics to Type preserves the entered card name", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      screen.getByRole("button", { name: "Next: Basics" }),
    ).toBeInTheDocument();

    await goToBasics(user);
    expect(screen.getByLabelText("Card name")).toHaveValue("Coffee card");
  });

  it("keeps the stamp mark section collapsed behind 'Show advanced options' until asked for", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await goToBasics(user);
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await goToRules(user);

    expect(
      screen.queryByRole("radio", { name: "Preset icon" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Show advanced options (stamp mark)",
      }),
    );
    expect(
      screen.getByRole("radio", { name: "Preset icon" }),
    ).toBeInTheDocument();
  });

  it("edit mode never shows the step indicator or wizard Next/Back controls", () => {
    render(
      <SetupForm
        program={stampProgram}
        isEdit={true}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.queryByText("1. Type")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next: Basics" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});

describe("SetupForm reward expiry field", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the reward-expiry field for a stamp card", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByLabelText(/reward expires after/i)).toBeInTheDocument();
  });

  it("hides the reward-expiry field for a lucky card", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));
    await user.click(screen.getByRole("button", { name: "Lucky Tap" }));
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });
});
