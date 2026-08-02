import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Benefits } from "@/components/landing/benefits";
import { Footer } from "@/components/landing/footer";
import { Faq } from "@/components/landing/faq";
import { BackToTop } from "@/components/landing/back-to-top";
import { createServerClient } from "@/lib/supabase/server";

export default async function Home() {
  // Reflect the session in the landing CTAs: a signed-in vendor jumps straight
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
        <Hero authed={authed} />
        <HowItWorks />
        <Benefits />
        <Faq />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
