import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Component tests opt into jsdom via a `// @vitest-environment jsdom` docblock.
// This setup runs for every file (node tests included), so only touch the DOM
// when one actually exists — otherwise the node-env lib tests would throw.
if (typeof Element !== "undefined") {
  // jsdom doesn't implement these — Radix's Select (and any future
  // Radix-based popover component) calls them internally for positioning,
  // and throws without a stub.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
