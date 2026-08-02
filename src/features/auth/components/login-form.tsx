"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { vendorPhoneOnboardAction } from "../api/actions";
import { Wordmark } from "@/components/landing/wordmark";
import { ElevatedCard } from "@/components/elevated-card";
import { GoogleMark } from "./google-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction, navigatingAway } from "@/hooks/use-async-action";
import { loginSchema, type LoginInput } from "@/lib/schemas";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const { pending: busy, run } = useAsyncAction();
  const [showPhoneOnboard, setShowPhoneOnboard] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  // The name+phone onboarding sub-flow (spec:
  // 2026-07-11-vendor-phone-onboarding-design.md) keeps its own hand-rolled
  // submit/error state rather than moving onto react-hook-form: it isn't a
  // validated email/password form, and folding it into the same resolver
  // risks changing its (deliberately unverified) behavior.
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Set once we've emailed the user and are waiting on their click:
  // "signup" = confirm the new account, "reset" = choose a new password.
  const [sent, setSent] = useState<{
    email: string;
    kind: "signup" | "reset";
  } | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const isSignin = mode === "signin";
  // Every submit surface (Google, phone-onboard toggle/submit, email form,
  // forgot-password) shares one disabled state, same as before the refactor —
  // only one of these flows can be in flight at a time.
  const anyBusy = busy || phoneBusy;

  function signInWithGoogle() {
    return run(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { hl: "en" },
        },
      });
      // On success the browser navigates to Google; only an early error lands here.
      if (error) toast.error(error.message);
    });
  }

  async function submitPhoneOnboard(e: React.FormEvent) {
    e.preventDefault();
    setPhoneBusy(true);
    setPhoneError(null);
    const supabase = createClient();
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      setPhoneError(anonError.message);
      setPhoneBusy(false);
      return;
    }
    try {
      const result = await vendorPhoneOnboardAction(vendorName, vendorPhone);
      if (result.error) {
        setPhoneError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      await navigatingAway();
    } catch {
      setPhoneError("Something went wrong. Try again.");
    } finally {
      setPhoneBusy(false);
    }
  }

  function onSubmit(data: LoginInput) {
    return run(async () => {
      const supabase = createClient();

      if (mode === "signup") {
        // Land the confirmation-email link back on loopkit — the project's Site URL
        // points at another kit (shared Supabase), so without this the confirm
        // link would bounce the vendor to the wrong app.
        const { data: result, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        // Email confirmation on → no session yet. Show a "check your email" state
        // instead of bouncing to a dashboard the user can't reach.
        if (!result.session) {
          setSent({ email: data.email, kind: "signup" });
          return;
        }
        router.push("/dashboard");
        router.refresh();
        await navigatingAway();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      await navigatingAway();
    });
  }

  // Email a password-reset link. The link lands on /auth/callback, which
  // establishes a recovery session and forwards to /reset-password.
  function sendReset() {
    const email = getValues("email");
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error("Enter your email first.");
      return;
    }
    return run(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent({ email, kind: "reset" });
    });
  }

  if (sent) {
    const isReset = sent.kind === "reset";
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <ElevatedCard className="px-7 py-10">
            <Wordmark className="text-2xl" />
            <h1 className="mt-6 text-3xl font-bold tracking-tight">
              Check your email
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isReset ? (
                <>
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Open it to choose a new password.
                </>
              ) : (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Click it to activate your account, then sign in.
                </>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-7 h-11 w-full rounded-xl"
              onClick={() => {
                setSent(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </ElevatedCard>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your loopkit dashboard.
          </p>
        </div>

        <ElevatedCard>
          <div className="px-7 pt-9 pb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {isSignin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignin
                ? "Sign in to your loopkit dashboard."
                : "Set up a loopkit account in seconds."}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={anyBusy}
              className="mt-7 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhoneOnboard((v) => !v)}
              disabled={anyBusy}
              className="mt-2.5 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
            >
              Continue with name & phone
            </Button>

            {showPhoneOnboard && (
              <form onSubmit={submitPhoneOnboard} className="mt-5 space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="vendor-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Your name or business
                  </Label>
                  <Input
                    id="vendor-name"
                    required
                    placeholder="Kopi Corner"
                    className="h-11 rounded-xl"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="vendor-phone"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Phone number
                  </Label>
                  <Input
                    id="vendor-phone"
                    type="tel"
                    required
                    placeholder="9123 4567"
                    className="h-11 rounded-xl"
                    value={vendorPhone}
                    onChange={(e) => setVendorPhone(e.target.value)}
                  />
                </div>
                {phoneError && (
                  <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                  >
                    {phoneError}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 w-full rounded-xl text-base font-semibold"
                  disabled={anyBusy}
                >
                  {phoneBusy ? "Please wait…" : "Continue"}
                </Button>
              </form>
            )}

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                or with email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.sg"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                {errors.email && (
                  <p
                    id="email-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </Label>
                  {isSignin && (
                    <button
                      type="button"
                      onClick={sendReset}
                      disabled={anyBusy}
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignin ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  className="h-11 rounded-xl"
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  {...register("password")}
                />
                {errors.password && (
                  <p
                    id="password-error"
                    className="text-sm font-medium text-destructive"
                  >
                    {errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={anyBusy}
              >
                {busy
                  ? "Please wait…"
                  : isSignin
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </div>

          <div className="border-t" />
          <p className="px-7 py-4 text-center text-sm text-muted-foreground">
            {isSignin ? "New to loopkit? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setMode(isSignin ? "signup" : "signin")}
            >
              {isSignin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </ElevatedCard>
      </div>
    </main>
  );
}
