// Shared client/server state type for the public card-check form. A
// "use server" module may only export async functions, so this plain module
// is what both actions.ts and check-form.tsx import.
export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  name?: string;
  label?: string;
  filled?: number;
  total?: number;
  rewardReady?: boolean;
  reward_text?: string;
  qr?: string;
  message?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
