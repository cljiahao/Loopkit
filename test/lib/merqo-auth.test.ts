import { describe, it, expect, beforeEach } from "vitest";
import { bearerOk, provisionBearerOk } from "@/lib/merqo-auth";

function req(auth?: string) {
  return new Request("http://localhost/api/merqo/vendor-provision", {
    headers: auth ? { Authorization: auth } : {},
  });
}

describe("bearerOk", () => {
  beforeEach(() => {
    process.env.MERQO_METRICS_SECRET = "metrics-secret";
    process.env.MERQO_PROVISION_SECRET = "provision-secret";
  });

  it("true when the header matches the named env var's secret", () => {
    expect(bearerOk(req("Bearer metrics-secret"), "MERQO_METRICS_SECRET")).toBe(
      true,
    );
  });

  it("false when the bearer is missing", () => {
    expect(bearerOk(req(), "MERQO_METRICS_SECRET")).toBe(false);
  });

  it("false when the header doesn't start with 'Bearer '", () => {
    expect(bearerOk(req("Token metrics-secret"), "MERQO_METRICS_SECRET")).toBe(
      false,
    );
  });

  it("false when the named env var is unset", () => {
    delete process.env.MERQO_METRICS_SECRET;
    expect(bearerOk(req("Bearer metrics-secret"), "MERQO_METRICS_SECRET")).toBe(
      false,
    );
  });

  it("false against a different env var's secret — the two must not be interchangeable", () => {
    expect(
      bearerOk(req("Bearer provision-secret"), "MERQO_METRICS_SECRET"),
    ).toBe(false);
  });
});

describe("provisionBearerOk", () => {
  beforeEach(() => {
    process.env.MERQO_PROVISION_SECRET = "provision-secret";
    process.env.MERQO_METRICS_SECRET = "metrics-secret";
  });

  it("true on the correct provision secret", () => {
    expect(provisionBearerOk(req("Bearer provision-secret"))).toBe(true);
  });

  it("false when the bearer is missing", () => {
    expect(provisionBearerOk(req())).toBe(false);
  });

  it("false when the METRICS secret is sent instead — the two must not be interchangeable", () => {
    expect(provisionBearerOk(req("Bearer metrics-secret"))).toBe(false);
  });

  it("false when MERQO_PROVISION_SECRET is unset", () => {
    delete process.env.MERQO_PROVISION_SECRET;
    expect(provisionBearerOk(req("Bearer provision-secret"))).toBe(false);
  });
});
