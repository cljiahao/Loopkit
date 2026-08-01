// Pure step config for the dashboard onboarding tour. No driver.js import here
// so it stays node-unit-testable; the controller maps these to driver's Config.

export type TourStep = {
  /** CSS selector for the element to spotlight. */
  element: string;
  title: string;
  description: string;
};

const sel = (tour: string) => `[data-tour="${tour}"]`;

// Desktop: nav links are visible, so we can spotlight each landmark.
const DESKTOP: TourStep[] = [
  {
    element: sel("shop-qr"),
    title: "Your shop QR",
    description:
      "Welcome to Loopkit. Put this QR code at your counter — customers scan it once to join every active program you run.",
  },
  {
    element: sel("nav-customers"),
    title: "Start here: Customers",
    description:
      "See everyone who's joined, their stamp progress, and their rewards, all in one list.",
  },
  {
    element: sel("nav-account"),
    title: "Your account",
    description:
      "Update your stall name, profile icon, and social links here — shared across every Merqo kit you use.",
  },
  {
    element: sel("tour-replay"),
    title: "Replay anytime",
    description:
      "Tap here to run this tour again whenever you like. Now — go put your QR code where customers can scan it →",
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
      "Customers, Activity, and Stats all live in here. Start with Customers to see who's joined.",
  },
  DESKTOP[DESKTOP.length - 1],
];

/** The tour steps for the current layout. */
export function tourSteps(isMobile: boolean): TourStep[] {
  return isMobile ? MOBILE : DESKTOP;
}
