import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./wordmark";

export function Nav({ authed = false }: { authed?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 py-4 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          href="/"
          className="rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-3xl" />
          <span className="sr-only">loopkit home</span>
        </Link>
        <div className="flex items-center gap-3">
          {/* Plain <a>, not next/link's Link: this is a same-page hash jump
              (Nav is only ever rendered on "/"), and Link doesn't reliably
              update the URL bar's hash when only the fragment changes — it
              scrolls but leaves the old hash showing. */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <a href="#faq">FAQ</a>
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
                Log in
              </Link>
              <Button asChild size="sm">
                <Link href="/login?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
