import Link from "next/link";
import { AboutMerqo } from "@merqo/ui";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "About",
};

export default async function AboutPage() {
  // Reflect the session in the landing CTA: a signed-in vendor jumps straight
  // to the dashboard instead of being sent back through /login.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authed = !!user;

  return (
    <>
      <Nav authed={authed} />
      <main>
        <AboutMerqo kitName="loopkit">
          <Button asChild size="lg">
            <Link href="/">Back to loopkit</Link>
          </Button>
        </AboutMerqo>
      </main>
      <Footer />
    </>
  );
}
