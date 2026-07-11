import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white",
  secondary:
    "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 ring-1 ring-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:ring-slate-700",
  ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:text-slate-300",
  danger: "bg-rose-600 hover:bg-rose-500 text-white",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-[12px] px-2.5 py-1.5 gap-1.5",
  md: "text-[13px] px-3.5 py-2 gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        // Spring-flavored ease-out + a tiny lift/press on hover/active --
        // the "Gemini effect": a click should feel physically tactile
        // rather than a flat color swap.
        "ros-focusable inline-flex items-center justify-center font-medium rounded-ros-md transition-all duration-200 ease-ros disabled:opacity-60 disabled:cursor-not-allowed",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
