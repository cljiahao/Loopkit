// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  LegalDocument: vi.fn((props: { doc: string }) => (
    <div data-testid="legal-document">{props.doc}</div>
  )),
}));

vi.mock("@merqo/ui", () => ({ LegalDocument: mocks.LegalDocument }));

import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it('renders @merqo/ui\'s LegalDocument with doc="privacy"', () => {
    const { getByTestId } = render(<PrivacyPage />);

    expect(getByTestId("legal-document")).toHaveTextContent("privacy");
  });
});
