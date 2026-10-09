import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native form semantics with the same chrome as ElevatedCard. */
export function FormCard({ className, ...props }: ComponentProps<"form">) {
  return (
    <form
      {...props}
      className={cn(
        "rounded-[20px] border bg-card shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
    />
  );
}
