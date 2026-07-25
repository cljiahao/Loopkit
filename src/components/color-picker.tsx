"use client";

import { HexColorPicker, HexColorInput } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// A shadcn-composed color picker — shadcn/ui has no official "color picker"
// primitive to `npx shadcn add` (Button/Popover/etc. are primitives; a full
// picker isn't one of them), so this follows the same pattern
// `info-tooltip.tsx` already establishes: a real shadcn primitive
// (`ui/popover.tsx`) composing a small, well-regarded headless library
// (`react-colorful`, ~2.8kB, no other dependencies) for the one piece
// shadcn doesn't ship, instead of a native `<input type="color">` (which
// hands the whole picker UI to the OS/browser with zero styling control).
// No separate CSS import — react-colorful 5.x injects its own styles at
// runtime, unlike older versions that shipped a dist/index.css.
// Used by setup-form.tsx's Wheel/Scratch segment editor.
export function ColorPicker({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          style={{ backgroundColor: value }}
          className={cn(
            "h-11 w-11 shrink-0 cursor-pointer rounded-xl border",
            className,
          )}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-2 p-3">
        <HexColorPicker color={value} onChange={onChange} />
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          aria-label={`${label} hex value`}
          className="h-9 w-full rounded-lg border bg-background px-2 text-center font-mono text-sm uppercase"
        />
      </PopoverContent>
    </Popover>
  );
}
