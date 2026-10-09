"use client";

import { HexColorPicker, HexColorInput } from "react-colorful";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
