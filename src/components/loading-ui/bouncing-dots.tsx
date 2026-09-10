import { cn } from "@/lib/utils";

type BouncingDotsProps = React.HTMLAttributes<HTMLSpanElement>;

export function BouncingDots({ className, ...props }: BouncingDotsProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex items-center justify-center gap-1 text-current", className)}
      {...props}
    >
      <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="size-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="size-2 animate-bounce rounded-full bg-current" />
    </span>
  );
}
