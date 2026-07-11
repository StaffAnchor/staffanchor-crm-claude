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
        "bg-white rounded-ros-lg border border-slate-200 shadow-ros-sm",
        padded && "p-5",
        interactive && "transition-all duration-[160ms] hover:border-blue-300 hover:shadow-ros-md cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
