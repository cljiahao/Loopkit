"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import { updateStallNameAction, updatePasswordAction } from "./actions";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

interface Props {
  vendorId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export function ProfileForm({ vendorId, email, name, avatarUrl }: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Stall name — persisted via a server action (RLS-scoped write to
  // loopkit.vendors) + revalidatePath so the nav picks it up.
  const initialName = name ?? "";
  const [stallName, setStallName] = useState(initialName);
  const { pending: savingName, run: runName } = useAsyncAction();

  // Photo — the uploader handles the storage upload; we persist the returned
  // URL straight to auth user_metadata client-side, same channel the nav
  // reads from (Task 3). No server action needed for this piece.
  const [avatar, setAvatar] = useState(avatarUrl);

  // Password — persisted via the browser auth client's own session, matched
  // client-side against a confirm field before it's ever sent.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending: savingPassword, run: runPassword } = useAsyncAction();

  function saveStallName() {
    return runName(async () => {
      const res = await updateStallNameAction(stallName.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stall name saved");
      router.refresh();
    });
  }

  async function handleAvatarChange(url: string | null) {
    setAvatar(url);
    const { error } = await supabase.auth.updateUser({
      data: { avatar_url: url },
    });
    if (error) {
      toast.error("Couldn't save your photo. Try again.");
      return;
    }
    toast.success(url ? "Photo saved" : "Photo removed");
    router.refresh();
  }

  function savePassword() {
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    return runPassword(async () => {
      const res = await updatePasswordAction(password);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  }

  const passwordsFilled = password.length > 0 && confirm.length > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Stall name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stall-name" className={labelClass}>
              Stall name
            </Label>
            <Input
              id="stall-name"
              value={stallName}
              maxLength={60}
              onChange={(e) => setStallName(e.target.value)}
              placeholder="Kopi Corner"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={saveStallName}
              disabled={savingName || stallName.trim() === initialName.trim()}
              className="h-10 rounded-xl font-semibold"
            >
              {savingName ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <ImageUploader
              bucket="vendor-images"
              pathPrefix={vendorId}
              value={avatar}
              onChange={handleAvatarChange}
            />
            <p className="text-xs text-muted-foreground">
              Shown in your account menu. Falls back to your initials when
              empty.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>
              Email
            </Label>
            <Input
              id="email"
              value={email}
              readOnly
              disabled
              className="h-11 rounded-xl bg-muted/40"
            />
            <p className="text-xs text-muted-foreground">
              Your sign-in email. It can&apos;t be changed here.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password" className={labelClass}>
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className={labelClass}>
              Confirm new password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              placeholder="••••••••"
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={savePassword}
              disabled={savingPassword || !passwordsFilled}
              className="h-10 rounded-xl font-semibold"
            >
              {savingPassword ? "Updating…" : "Update password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
