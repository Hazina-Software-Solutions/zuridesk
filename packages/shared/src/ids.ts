import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/, "must be a lowercase 24-character hexadecimal ObjectId")
  .brand<"ObjectIdString">();

export type ObjectIdString = z.infer<typeof objectIdSchema>;
