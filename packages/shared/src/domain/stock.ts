import { z } from "zod";

declare const stockQuantityBrand: unique symbol;

export type StockQuantity = number & {
  readonly [stockQuantityBrand]: "StockQuantity";
};

export const stockUnitSchema = z.enum(["each", "ml", "g"]);
export type StockUnit = z.infer<typeof stockUnitSchema>;

export const stockQuantitySchema = z
  .number()
  .int("stock quantity must use integer base units")
  .nonnegative("stock quantity cannot be negative")
  .max(Number.MAX_SAFE_INTEGER, "stock quantity exceeds the safe integer range")
  .transform((value) => value as StockQuantity);
