// Shared client/server state type for the referral-host create form. A
// "use server" module may only export async functions, so this plain module
// is what both actions.ts and referrals-panel.tsx import — same split
// card-check's types.ts uses for the same reason.
export type ReferralHostSummary = {
  id: string;
  programId: string;
  programName: string;
  hostPhone: string;
  label: string | null;
  referralCode: string;
  guestCount: number;
  link: string;
  qr: string;
};

export type CreateReferralHostState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; host: ReferralHostSummary };

export const CREATE_REFERRAL_HOST_IDLE: CreateReferralHostState = {
  status: "idle",
};
