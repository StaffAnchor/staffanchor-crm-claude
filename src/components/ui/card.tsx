import { cn } from "@/lib/cn";

export function Card({
  className,
  padded = true,
  interactive = false,
  children,
  ...rest
}: {
  padded?: boolean;
  interactive?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-900 rounded-ros-xl border border-slate-100 dark:border-slate-800 shadow-ros-sm",
        padded && "p-6",
        interactive &&
          "transition-all duration-200 ease-ros hover:border-blue-200 dark:hover:border-blue-600 hover:shadow-ros-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
