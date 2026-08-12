import { HeartHandshake, Zap, WalletMinimal } from "lucide-react";

const BENEFITS = [
  {
    icon: HeartHandshake,
    title: "Regulars, not one-offs",
    body: "A reason to come back beats a one-time sale. loopkit gives them the reason — a reward they're already halfway to.",
  },
  {
    icon: Zap,
    title: "Zero friction",
    body: "No app for customers, no plastic cards, no hardware. A phone number is the whole thing.",
  },
  {
    icon: WalletMinimal,
    title: "Built for a stall",
    body: "Made for home kitchens, pop-ups, and small cafes — plain, fast, and priced for one counter.",
  },
];

export function Benefits() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Why vendors switch
        </p>
        <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Less setup, more regulars.
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title}>
              <b.icon className="size-6 text-primary" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-bold">{b.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
