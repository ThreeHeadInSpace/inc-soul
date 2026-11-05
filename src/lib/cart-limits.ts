import { z } from "zod";

// Technical ceilings keep uploads and SMTP attachments bounded.
// These do not define the eventual commercial allowance.
export const CART_LIMITS = {
  strips: 4,
  perStrip: 12,
  copies: 24,
  assetBytes: 3_300_000,
  totalBytes: 9_000_000,
};
export const cartLines = z
  .array(
    z.object({
      stripId: z.uuid(),
      quantity: z.number().int().min(1).max(CART_LIMITS.perStrip),
    }),
  )
  .min(1)
  .max(CART_LIMITS.strips)
  .refine(
    (lines) => new Set(lines.map((line) => line.stripId)).size === lines.length,
    "Фотоленты повторяются",
  )
  .refine(
    (lines) => lines.reduce((sum, line) => sum + line.quantity, 0) <= CART_LIMITS.copies,
    "Уменьшите общий тираж",
  );
