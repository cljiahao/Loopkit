// Shared client/server state type for the stamp form. A "use server" module
// may only export async functions, so this lives in a plain module that both
// actions.ts and stamp-form.tsx can import.
export type StampState = {
  status: "idle" | "ok" | "error";
  card?: { id: string; phone: string; stamp_count: number };
  rewardReady?: boolean;
  message?: string;
};

export const STAMP_IDLE: StampState = { status: "idle" };
