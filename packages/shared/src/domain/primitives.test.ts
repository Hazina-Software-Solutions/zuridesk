import { describe, expect, it } from "vitest";

import {
  basisPointsSchema,
  currencyCodeSchema,
  e164PhoneNumberSchema,
  moneyMinorSchema,
  normalizedEmailSchema,
  schemaVersionSchema,
  stockQuantitySchema,
  stockUnitSchema
} from "../index";

describe("shared data primitives", () => {
  it("accepts KES integer minor units and rejects floats or negatives", () => {
    expect(currencyCodeSchema.parse("KES")).toBe("KES");
    expect(moneyMinorSchema.parse(125_00)).toBe(125_00);
    expect(moneyMinorSchema.safeParse(12.5).success).toBe(false);
    expect(moneyMinorSchema.safeParse(-1).success).toBe(false);
  });

  it("constrains percentages expressed as basis points", () => {
    expect(basisPointsSchema.parse(1_500)).toBe(1_500);
    expect(basisPointsSchema.safeParse(10_001).success).toBe(false);
    expect(basisPointsSchema.safeParse(1.5).success).toBe(false);
  });

  it("normalizes email and validates E.164 phone numbers", () => {
    expect(normalizedEmailSchema.parse(" Owner@ZuriDesk.Example ")).toBe("owner@zuridesk.example");
    expect(e164PhoneNumberSchema.parse("+254712345678")).toBe("+254712345678");
    expect(e164PhoneNumberSchema.safeParse("0712345678").success).toBe(false);
  });

  it("allows only integer stock base units", () => {
    expect(stockUnitSchema.options).toEqual(["each", "ml", "g"]);
    expect(stockQuantitySchema.parse(750)).toBe(750);
    expect(stockQuantitySchema.safeParse(0.5).success).toBe(false);
  });

  it("requires positive integer schema versions", () => {
    expect(schemaVersionSchema.parse(1)).toBe(1);
    expect(schemaVersionSchema.safeParse(0).success).toBe(false);
  });
});
