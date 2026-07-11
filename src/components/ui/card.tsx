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
        "bg-white dark:bg-slate-900 rounded-ros-lg border border-slate-200 dark:border-slate-700 shadow-ros-sm",
        padded && "p-5",
        interactive &&
          "transition-all duration-200 ease-ros hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-ros-md hover:-translate-y-px active:translate-y-0 active:scale-[0.98] cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
