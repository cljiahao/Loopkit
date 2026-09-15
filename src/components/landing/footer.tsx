import Link from "next/link";
import { Footer as SharedFooter } from "@merqo/ui";
import { Wordmark } from "./wordmark";

export function Footer() {
  return (
    <SharedFooter
      wordmark={
        <Link
          href="/"
          aria-label="loopkit home"
          className="transition-opacity hover:opacity-80"
        >
          <Wordmark className="text-xl" />
        </Link>
      }
      tagline="Loyalty for Singapore’s small vendors."
      kitName="loopkit"
    />
  );
}
