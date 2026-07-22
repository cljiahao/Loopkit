import { describe, it, expect } from "vitest";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
} from "./card-type-picker";

describe("FAMILIES", () => {
  it("has exactly 4 families in order: stamp, growth, points, chance", () => {
    expect(FAMILIES.map((f) => f.key)).toEqual([
      "stamp",
      "growth",
      "points",
      "chance",
    ]);
  });

  it("stamp has 1 style, growth has 3, points has 1, chance has 3", () => {
    expect(familyOf("stamp").styles).toHaveLength(1);
    expect(familyOf("growth").styles).toHaveLength(3);
    expect(familyOf("points").styles).toHaveLength(1);
    expect(familyOf("chance").styles).toHaveLength(3);
  });
});

describe("isSingleStyleFamily", () => {
  it("is true only for stamp and points", () => {
    expect(isSingleStyleFamily("stamp")).toBe(true);
    expect(isSingleStyleFamily("points")).toBe(true);
    expect(isSingleStyleFamily("growth")).toBe(false);
    expect(isSingleStyleFamily("chance")).toBe(false);
  });
});

describe("resolveFamilyAndStyle", () => {
  it("maps stamp with no/'dots' variant to the stamp family's dots style", () => {
    expect(resolveFamilyAndStyle("stamp", undefined)).toEqual({
      family: "stamp",
      style: "dots",
    });
    expect(resolveFamilyAndStyle("stamp", "dots")).toEqual({
      family: "stamp",
      style: "dots",
    });
  });

  it("maps stamp/flame to the growth family", () => {
    expect(resolveFamilyAndStyle("stamp", "flame")).toEqual({
      family: "growth",
      style: "flame",
    });
  });

  it("maps stamp/points to the points family", () => {
    expect(resolveFamilyAndStyle("stamp", "points")).toEqual({
      family: "points",
      style: "points",
    });
  });

  it("maps plant with no/'plant' variant and 'cup' variant to the growth family", () => {
    expect(resolveFamilyAndStyle("plant", undefined)).toEqual({
      family: "growth",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "plant")).toEqual({
      family: "growth",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "cup")).toEqual({
      family: "growth",
      style: "cup",
    });
  });

  it("maps wheel and scratch to the chance family", () => {
    expect(resolveFamilyAndStyle("wheel", undefined)).toEqual({
      family: "chance",
      style: "wheel",
    });
    expect(resolveFamilyAndStyle("scratch", undefined)).toEqual({
      family: "chance",
      style: "scratch",
    });
  });

  it("maps lucky to the chance family", () => {
    expect(resolveFamilyAndStyle("lucky", undefined)).toEqual({
      family: "chance",
      style: "lucky",
    });
  });
});

describe("styleToTypeAndVariant", () => {
  it("round-trips every style through resolveFamilyAndStyle back to itself", () => {
    for (const family of FAMILIES) {
      for (const style of family.styles) {
        const { type, variant } = styleToTypeAndVariant(style.key);
        expect(resolveFamilyAndStyle(type, variant)).toEqual({
          family: family.key,
          style: style.key,
        });
      }
    }
  });

  it("wheel, scratch, and lucky styles carry no variant", () => {
    expect(styleToTypeAndVariant("wheel").variant).toBeUndefined();
    expect(styleToTypeAndVariant("scratch").variant).toBeUndefined();
    expect(styleToTypeAndVariant("lucky").variant).toBeUndefined();
  });
});
