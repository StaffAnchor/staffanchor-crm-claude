import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white",
  secondary: "bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  ghost: "bg-transparent hover:bg-slate-100 text-slate-600",
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
        "inline-flex items-center justify-center font-medium rounded-ros-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
        "duration-[160ms]",
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
