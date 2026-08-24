// Pure step config for the dashboard onboarding tour. No driver.js import here
// so it stays node-unit-testable; the controller maps these to driver's Config.
import { stampStrategy } from "@/lib/engine/stamp";

export type TourStep = {
  /** CSS selector for the element to spotlight. */
  element: string;
  title: string;
  description: string;
};

const sel = (tour: string) => `[data-tour="${tour}"]`;

// Real progress label, not a hand-copied one, so the example can't drift.
const exampleProgressLabel = stampStrategy.progress(
  { stamp_count: 5, reward_count: 0 },
  { stamps_required: 8, reward_text: "" },
  new Date(),
).label;

// Desktop: nav links are visible, so we can spotlight each landmark.
const DESKTOP: TourStep[] = [
  {
    element: sel("shop-qr"),
    title: "Your shop QR",
    description:
      "Welcome to Loopkit. Put this QR code at your counter. Customers scan it once to join every active program you run." +
      `<div class="tour-example"><div class="tour-example-label">Example card</div><div class="tour-example-row" style="margin-top:0.35rem"><strong>${exampleProgressLabel}</strong></div></div>`,
  },
  {
    element: sel("nav-customers"),
    title: "Start here: Customers",
    description:
      "Search a customer by phone number to add a stamp or check their progress. Tap into a program to open its counter, where every stamp gets added.",
  },
  {
    element: sel("nav-activity"),
    title: "Activity",
    description:
      "See every stamp and reward as it happens, across all your programs, in one running feed.",
  },
  {
    element: sel("nav-stats"),
    title: "Stats",
    description:
      "Track how many customers you have and how often they come back.",
  },
  {
    element: sel("nav-account"),
    title: "Your account",
    description:
      "Update your stall name, profile icon, and social links here. Shared across every Merqo kit you use.",
  },
  {
    element: sel("tour-replay"),
    title: "Replay anytime",
    description:
      "Tap here to run this tour again whenever you like. Ready? Go put your QR code where customers can scan it.",
  },
];

// Mobile: nav is collapsed behind the hamburger, so spotlight that instead of
// the hidden links (driver can't highlight an off-screen element).
const MOBILE: TourStep[] = [
  DESKTOP[0],
  {
    element: sel("nav-menu"),
    title: "Your sections",
    description:
      "Customers, Activity, and Stats all live in here. Start with Customers to add your first stamp.",
  },
  DESKTOP[DESKTOP.length - 1],
];

/** The tour steps for the current layout. */
export function tourSteps(isMobile: boolean): TourStep[] {
  return isMobile ? MOBILE : DESKTOP;
}
