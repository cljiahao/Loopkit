import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  // No min-length here: unlike a new-password field, this just guards against
  // an empty submit — Supabase itself is the source of truth on password
  // policy and returns its own error for a rejected sign-in/sign-up.
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const supportMessageSchema = z.object({
  category: z.enum(["program", "customers", "billing", "other"]),
  body: z.string().trim().min(1, "Tell us what's wrong").max(2000),
});
export type SupportMessageInput = z.infer<typeof supportMessageSchema>;

export const SUPPORT_CATEGORY_LABELS: Record<
  SupportMessageInput["category"],
  string
> = {
  program: "Program / cards",
  customers: "Customers",
  billing: "Pro plan",
  other: "Something else",
};

// A generous but real ceiling (S$10,000) so a forged/garbled form payload
// can't write an absurd price — same sentinel value qkit's schemas.ts uses
// for every money field.
export const MAX_MONEY_CENTS = 10_000_00;

export const pricingFormSchema = z.object({
  monthly_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
});
export type PricingFormInput = z.infer<typeof pricingFormSchema>;
