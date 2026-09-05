import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "solid";
export type IconButtonSize = "sm" | "md";

// Small icon-only button -- formalizes the pattern hand-rolled per
// component for close/edit/expand affordances (Dialog/Drawer's own close
// button, popover triggers, etc.), each previously re-deriving its own
// hover/focus classes. Same tactile press physics as Button (see
// button.tsx's "Gemini effect" comment) so every icon-only action in the
// app feels the same to click, not just every full-label one.
const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
  solid:
    "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "p-1",
  md: "p-1.5",
};

export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  className,
  children,
  ...rest
}: {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Required -- becomes aria-label since the button has no visible text. */
  label: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "ros-focusable inline-flex items-center justify-center rounded-ros-sm transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
