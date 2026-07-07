import { CreditCard, Smartphone, Gift } from "lucide-react";

// A real sequence (set up → stamp → return), so numbered markers carry meaning.
const STEPS = [
  {
    icon: CreditCard,
    title: "Set up your card",
    body: "Pick how many stamps earn a reward and what the reward is. Two minutes.",
  },
  {
    icon: Smartphone,
    title: "Stamp by phone",
    body: "At the counter, type the customer's number and tap. No app, no card to carry.",
  },
  {
    icon: Gift,
    title: "They come back",
    body: "When the card's full they redeem the reward — and you've made a regular.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          How it works
        </p>
        <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Loyalty that runs itself.
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-border" />
                <s.icon className="size-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
