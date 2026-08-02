import Link from "next/link";
import { Wordmark } from "./wordmark";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row">
        <Link
          href="/"
          aria-label="loopkit home"
          className="transition-opacity hover:opacity-80"
        >
          <Wordmark className="text-xl" />
        </Link>
        <span>Loyalty for Singapore&rsquo;s small vendors.</span>
        <span className="text-xs">© 2026 loopkit · a Merqo kit</span>
        <Link href="/login" className="hover:text-foreground">
          Vendor sign in →
        </Link>
      </div>
    </footer>
  );
}
