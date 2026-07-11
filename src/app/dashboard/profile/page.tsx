import { requireVendor } from "@/lib/auth";
import { getVendorProfile } from "@/lib/vendor";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const profile = await getVendorProfile();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall details and account.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
      />
    </main>
  );
}
