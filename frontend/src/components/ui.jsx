import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function Button({ className, variant = "primary", ...props }) {
  const variants = {
    primary: "bg-medical-600 text-white hover:bg-medical-700 active:bg-medical-800",
    secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300 active:bg-slate-400",
    outline: "border border-slate-300 bg-transparent hover:bg-slate-50",
    ghost: "bg-transparent hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-medical-500 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function Alert({ variant = "info", title, children, className }) {
  const variants = {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    error: "bg-red-50 border-red-200 text-red-800",
    success: "bg-green-50 border-green-200 text-green-800",
  };

  return (
    <div className={cn("rounded-lg border p-4 text-sm animate-fade-in", variants[variant], className)}>
      {title && <h4 className="mb-1 font-semibold">{title}</h4>}
      <div>{children}</div>
    </div>
  );
}
