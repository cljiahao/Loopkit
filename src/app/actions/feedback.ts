"use server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { submitVendorFeedback } from "@/lib/merqo-vendor-feedback";
import type { ActionResult } from "@/lib/action-result";

const feedbackSchema = z.object({
  nps: z.number().int().min(0).max(10),
  message: z.string().trim().max(2000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * Submit vendor NPS feedback for loopkit into the shared cross-kit
 * merqo.vendor_feedback table via merqo.submit_vendor_feedback — the
 * SECURITY DEFINER function is the authorization boundary (it writes
 * auth.uid() as vendor_id itself, never a passed-in value).
 */
export async function submitFeedbackAction(
  input: FeedbackInput,
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid feedback",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  try {
    await submitVendorFeedback(
      supabase,
      "loopkit",
      parsed.data.nps,
      parsed.data.message ?? null,
    );
  } catch (err) {
    console.error(
      "submitFeedbackAction failed",
      err instanceof Error ? err.message : err,
    );
    return { success: false, error: "Could not send feedback" };
  }
  return { success: true };
}
