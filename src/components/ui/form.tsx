import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass = "min-h-9 w-full rounded-lg border border-border bg-[#12141d] px-3 py-2 text-sm placeholder:text-[#787b92] focus:border-primary";
export function Input({ className, ...props }: ComponentProps<"input">) { return <input className={cn(inputClass, className)} {...props} />; }
export function Textarea({ className, ...props }: ComponentProps<"textarea">) { return <textarea className={cn(inputClass, "min-h-20", className)} {...props} />; }
export function Select({ className, ...props }: ComponentProps<"select">) { return <select className={cn(inputClass, className)} {...props} />; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-sm font-medium text-[#d9dae5]"><span>{label}</span>{children}</label>; }
export function Action({ action, next, children, className }: { action: string; next: string; children: ReactNode; className?: string }) {
  return <form method="post" action="/api/actions" className={className}><input type="hidden" name="_action" value={action} /><input type="hidden" name="_next" value={next} />{children}</form>;
}
export function Hidden({ name = "id", value }: { name?: string; value: string }) { return <input type="hidden" name={name} value={value} />; }
