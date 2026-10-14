import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native <select>: accessible, mobile-friendly, and strictly typed via onChange. */
function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        // 16px text on phones: anything smaller makes iOS zoom the page when the control is focused.
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base transition-colors md:text-sm pointer-coarse:min-h-11 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { NativeSelect };
