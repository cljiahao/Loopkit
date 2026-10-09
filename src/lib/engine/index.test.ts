import { describe, expect, it } from "vitest";
import {
  applyVisit,
  getProgress,
  type CardLike,
  type ProgramLike,
} from "./index";

const now = new Date("2026-10-09T00:00:00Z");
const emptyCard: CardLike = { state: {}, stamp_count: 7, reward_count: 3 };
function program(type: "wheel" | "scratch", cooldown = 0): ProgramLike {
  return {
    type,
    stamps_required: 10,
    reward_text: "Default reward",
    config: {
      variant: type,
      cooldown_visits: cooldown,
      reward_text: "Default reward",
      segments: [
        { id: "miss", label: "Try again", weight: 1 },
        { id: "win", label: "Free coffee", weight: 1, reward_text: "Coffee" },
      ],
    },
  };
}

describe.each(["wheel", "scratch"] as const)("%s engine dispatch", (type) => {
  it("uses a fresh chance state and returns a winning segment rather than stamp progress", () => {
    expect(
      applyVisit(
        program(type),
        emptyCard,
        { kind: "visit", payload: { roll: 0.75 } },
        now,
      ),
    ).toEqual({
      state: { visits_since_win: 0, total_wins: 1, landed_segment_id: "win" },
      rewardUnlocked: true,
    });
  });
  it("preserves prior wins on a losing visit and exposes the selected chance variant", () => {
    const card: CardLike = {
      ...emptyCard,
      state: { visits_since_win: 2, total_wins: 4, landed_segment_id: "win" },
    };
    const outcome = applyVisit(
      program(type),
      card,
      { kind: "visit", payload: { roll: 0.25 } },
      now,
    );
    expect(outcome).toEqual({
      state: { visits_since_win: 3, total_wins: 4, landed_segment_id: "miss" },
      rewardUnlocked: false,
    });
    expect(
      getProgress(program(type), { ...card, state: outcome.state }, now),
    ).toMatchObject({
      stage: "play",
      view: { kind: "chance", variant: type, landedId: "miss" },
      rewardReady: false,
    });
  });
  it("enforces chance cooldown even when the supplied roll would otherwise win", () => {
    expect(
      applyVisit(
        program(type, 2),
        emptyCard,
        { kind: "visit", payload: { roll: 0.75 } },
        now,
      ),
    ).toEqual({
      state: { visits_since_win: 1, total_wins: 0, landed_segment_id: "miss" },
      rewardUnlocked: false,
    });
  });
  it("renders an unplayed chance card from empty state with the correct prompt", () => {
    expect(getProgress(program(type), emptyCard, now)).toMatchObject({
      label: type === "wheel" ? "Spin to play" : "Scratch to reveal",
      view: { kind: "chance", variant: type, landedId: null },
    });
  });
});
