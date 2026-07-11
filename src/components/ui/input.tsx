import { cn } from "@/lib/cn";

const BASE = "w-full rounded-ros-md border border-slate-300 px-3 py-2 text-[13px] outline-none transition-colors duration-[160ms] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400";

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
