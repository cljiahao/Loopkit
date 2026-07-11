"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveStallName } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";

export async function updateStallNameAction(
  name: string,
): Promise<{ error?: string }> {
  const res = await saveStallName(name);
  if (!res.error) revalidatePath("/dashboard", "layout");
  return res;
}

const passwordSchema = z.string().min(8).max(72);

export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "Use at least 8 characters." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Couldn't update your password. Try again." };
  return {};
}
