// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scheduleMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  scheduleRetirementAction: scheduleMock,
}));

import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";

describe("ScheduleRetirementForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a successor picker with the given programs and a date input", () => {
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    expect(screen.getByLabelText("Replacement card")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "New card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Another card" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Retirement date")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule retirement" }),
    ).toBeInTheDocument();
  });

  it("submits the program id, chosen successor, and date", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[{ id: "p2", name: "New card" } as never]}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Replacement card"), "p2");
    await user.type(screen.getByLabelText("Retirement date"), "2030-01-01");
    await user.click(
      screen.getByRole("button", { name: "Schedule retirement" }),
    );
    expect(scheduleMock).toHaveBeenCalled();
  });
});
