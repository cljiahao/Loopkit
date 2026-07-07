import Link from "next/link";
import { Wordmark } from "./wordmark";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-1 text-xs text-muted-foreground">
            Loyalty for Singapore&rsquo;s small vendors.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/login" className="hover:text-foreground">
            Log in
          </Link>
          <span className="text-xs">© 2026 loopkit · a Merqo kit</span>
        </div>
      </div>
    </footer>
  );
}
