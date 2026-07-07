import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Cta({ authed = false }: { authed?: boolean }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Start your loyalty card today.
          </h2>
          <p className="mt-2 max-w-md text-primary-foreground/80">
            Set it up in minutes and stamp your first customer this afternoon.
            Free to start.
          </p>
        </div>
        <Button
          asChild
          size="lg"
          className="bg-gold text-gold-foreground hover:bg-gold/90"
        >
          <Link href={authed ? "/dashboard" : "/login"}>
            {authed ? "Go to dashboard" : "Get started"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
