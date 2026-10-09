"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import {
  customerTokenSchema,
  readCustomerProof,
  saveCustomerProof,
} from "@/lib/customer-proof";

export type EarnState = {
  status: "idle" | "error" | "success";
  message?: string;
  stampCount?: number;
  stampsRequired?: number;
  rewardText?: string;
};

const inputSchema = z.object({
  order: z.string().uuid(),
  phone: z.string().max(30),
  name: z.string().trim().max(100),
  token: z.union([customerTokenSchema, z.literal("")]),
});
const resultSchema = z.object({
  vendor_id: z.string().uuid(),
  card_token: customerTokenSchema,
  stamp_count: z.number().int().nonnegative(),
  stamps_required: z.number().int().positive(),
  reward_text: z.string(),
});
const recoveryMessage =
  "Open your saved card or paste its card token. If you cannot access it, ask the shop to recover your card.";

export async function claimEarnAction(
  _prev: EarnState,
  formData: FormData,
): Promise<EarnState> {
  const input = inputSchema.safeParse({
    order: formData.get("order"),
    phone: formData.get("phone"),
    name: formData.get("name") ?? "",
    token: formData.get("token") ?? "",
  });
  if (!input.success)
    return {
      status: "error",
      message: "Check the order link, name and saved card token.",
    };
  const normalized = normalizePhone(input.data.phone);
  if (!normalized.ok)
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  try {
    const supabase = await createServiceClient();
    const { data: vendor, error: vendorError } = await supabase.rpc(
      "qkit_earn_vendor",
      { p_order_id: input.data.order },
    );
    const vendorId = z.string().uuid().safeParse(vendor);
    if (vendorError || !vendorId.success)
      return { status: "error", message: "This link isn't valid." };
    const token = input.data.token || (await readCustomerProof(vendorId.data));
    const { data, error } = await supabase.rpc("customer_qkit_earn_claim", {
      p_order_id: input.data.order,
      p_phone: normalized.phone,
      p_name: input.data.name || null,
      p_token: token,
    });
    if (error) return { status: "error", message: recoveryMessage };
    const result = resultSchema.safeParse(data);
    if (!result.success || result.data.vendor_id !== vendorId.data)
      return {
        status: "error",
        message: "Something went wrong. Please try again.",
      };
    await saveCustomerProof(vendorId.data, result.data.card_token);
    return {
      status: "success",
      stampCount: result.data.stamp_count,
      stampsRequired: result.data.stamps_required,
      rewardText: result.data.reward_text,
    };
  } catch {
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
    };
  }
}
