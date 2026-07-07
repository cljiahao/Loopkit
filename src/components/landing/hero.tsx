import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StampCard } from "./stamp-card";

const TRUST = ["No app for customers", "Just a phone number", "Free to start"];

export function Hero({ authed = false }: { authed?: boolean }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
      <div className="fade-rise">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          loopkit · loyalty for small vendors
        </p>
        <h1 className="mt-4 max-w-xl text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Turn one-time buyers into regulars.
        </h1>
        <p className="mt-5 max-w-md text-lg text-muted-foreground">
          A digital stamp card for your stall. Stamp customers by phone, reward
          the regulars — nothing for them to download.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={authed ? "/dashboard" : "/login"}>
              {authed ? "Go to dashboard" : "Get started"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how">How it works</a>
          </Button>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {TRUST.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="fade-rise flex justify-center lg:justify-end">
        <StampCard />
      </div>
    </section>
  );
}
