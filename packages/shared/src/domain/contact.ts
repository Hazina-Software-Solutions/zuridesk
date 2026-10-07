import { z } from "zod";

declare const e164PhoneNumberBrand: unique symbol;
declare const normalizedEmailBrand: unique symbol;

export type E164PhoneNumber = string & {
  readonly [e164PhoneNumberBrand]: "E164PhoneNumber";
};
export type NormalizedEmail = string & {
  readonly [normalizedEmailBrand]: "NormalizedEmail";
};

export const e164PhoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "must be a valid E.164 phone number")
  .transform((value) => value as E164PhoneNumber);

export const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .transform((value) => value as NormalizedEmail);
