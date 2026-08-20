"use client";

import { useActionState, useState } from "react";
import { createReferralHostAction } from "./actions";
import { CREATE_REFERRAL_HOST_IDLE, type ReferralHostSummary } from "./types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ElevatedCard } from "@/components/elevated-card";
import { CardLinkActions } from "@/app/dashboard/card-link";

type Program = { id: string; name: string };

export function ReferralsPanel({
  programs,
  initialHosts,
}: {
  programs: Program[];
  initialHosts: ReferralHostSummary[];
}) {
  const [state, formAction, pending] = useActionState(
    createReferralHostAction,
    CREATE_REFERRAL_HOST_IDLE,
  );
  const [hosts, setHosts] = useState(initialHosts);
  // Appends the freshly created host to the local list once per successful
  // create — comparing against the last-applied host id (not an effect)
  // keeps this correct across re-renders, same idiom check-form.tsx uses to
  // react to a fresh useActionState result during render.
  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (state.status === "created" && state.host.id !== appliedId) {
    setAppliedId(state.host.id);
    setHosts((prev) => [state.host, ...prev]);
  }

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="space-y-3 rounded-[20px] border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]"
      >
        <div className="space-y-2">
          <Label htmlFor="referral-program" className="text-sm">
            Program
          </Label>
          <Select name="program_id">
            <SelectTrigger id="referral-program" className="w-full">
              <SelectValue placeholder="Choose a program" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="referral-host-phone" className="text-sm">
            Host&apos;s phone
          </Label>
          <Input
            id="referral-host-phone"
            name="host_phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="referral-label" className="text-sm">
            Label (optional)
          </Label>
          <Input
            id="referral-label"
            name="label"
            placeholder="Sarah & Wei's Wedding"
            className="h-11 rounded-xl"
          />
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-full rounded-xl text-sm font-semibold"
        >
          {pending ? "Creating…" : "Create referral link"}
        </Button>
      </form>

      {hosts.length === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">
            No referral links yet — create one above to give a host their own
            shareable link.
          </p>
        </ElevatedCard>
      ) : (
        <ul className="space-y-3">
          {hosts.map((host) => (
            <ElevatedCard as="li" key={host.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {host.label || host.programName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {host.programName} · {host.hostPhone}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-semibold tabular-nums">
                  {host.guestCount} guest{host.guestCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0 rounded-xl border bg-white p-1.5 [&_svg]:size-16"
                  dangerouslySetInnerHTML={{ __html: host.qr }}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                    {host.link}
                  </code>
                  <CardLinkActions link={host.link} />
                </div>
              </div>
            </ElevatedCard>
          ))}
        </ul>
      )}
    </div>
  );
}
