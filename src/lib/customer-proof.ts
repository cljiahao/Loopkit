import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";

export const vendorIdSchema = z.string().uuid();
export const customerTokenSchema = z.string().regex(/^[a-f0-9]{32}$/);

function cookieName(vendorId: string) {
  return "loopkit_customer_" + vendorIdSchema.parse(vendorId);
}

export async function readCustomerProof(
  vendorId: string,
): Promise<string | null> {
  const store = await cookies();
  const parsed = customerTokenSchema.safeParse(
    store.get(cookieName(vendorId))?.value,
  );
  return parsed.success ? parsed.data : null;
}

export async function clearCustomerProof(vendorId: string): Promise<void> {
  const name = cookieName(vendorId);
  const store = await cookies();
  store.delete(name);
}

export async function saveCustomerProof(
  vendorId: string,
  token: string,
): Promise<void> {
  const store = await cookies();
  store.set(cookieName(vendorId), customerTokenSchema.parse(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}
