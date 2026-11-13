import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", {
  variants: { variant: {
    primary: "bg-primary text-primary-foreground hover:bg-[#bbb2ff]",
    secondary: "border border-border bg-[#20222e] hover:bg-[#2b2d3c]",
    ghost: "text-muted-foreground hover:bg-[#20222e] hover:text-foreground",
    danger: "border border-[#623b49] bg-[#2b1922] text-danger hover:bg-[#43212d]",
  } },
  defaultVariants: { variant: "secondary" },
});
type Props = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;
export function Button({ variant, className, ...props }: Props) { return <button className={cn(buttonVariants({ variant }), className)} {...props} />; }
