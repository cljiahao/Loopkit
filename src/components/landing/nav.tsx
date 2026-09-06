import { LandingNav } from "@merqo/ui";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function Nav({ authed = false }: { authed?: boolean }) {
  return (
    <LandingNav
      wordmark={
        <Link
          href="/"
          className="rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-3xl" />
          <span className="sr-only">loopkit home</span>
        </Link>
      }
      end={
        <>
          <Link
            href="/about"
            className="rounded-sm px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            About
          </Link>
          {/* Plain <a>, not next/link's Link: a same-document hash jump
              doesn't reliably update the URL bar's hash when only the
              fragment changes via Link — it scrolls but leaves the old hash
              showing. The leading "/" makes it resolve correctly from "/about"
              too, not just from "/" where Nav also renders. */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- fragment-only jump, not real page navigation */}
            <a href="/#faq">FAQ</a>
          </Button>
          {authed ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-sm px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
