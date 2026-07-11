import { cn } from "@/lib/cn";

const BASE =
  "w-full rounded-ros-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-[13px] outline-none transition-colors duration-[160ms] focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 placeholder:text-slate-400 dark:placeholder:text-slate-500";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(BASE, "cursor-pointer", className)} {...rest}>
      {children}
    </select>
  );
}
