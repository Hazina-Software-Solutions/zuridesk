import { z } from "zod";

declare const moneyMinorBrand: unique symbol;
declare const basisPointsBrand: unique symbol;

export type MoneyMinor = number & { readonly [moneyMinorBrand]: "MoneyMinor" };
export type BasisPoints = number & { readonly [basisPointsBrand]: "BasisPoints" };

export const currencyCodeSchema = z.literal("KES");
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

export const moneyMinorSchema = z
  .number()
  .int("money must use integer minor units")
  .nonnegative("money cannot be negative")
  .max(Number.MAX_SAFE_INTEGER, "money exceeds the safe integer range")
  .transform((value) => value as MoneyMinor);

export const basisPointsSchema = z
  .number()
  .int("basis points must be an integer")
  .min(0)
  .max(10_000)
  .transform((value) => value as BasisPoints);
