import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TextShimmerProps = HTMLAttributes<HTMLSpanElement> & {
  baseColor?: string;
  shimmerColor?: string;
};

export function TextShimmer({
  className,
  baseColor = "var(--color-foreground)",
  shimmerColor = "var(--color-primary)",
  style,
  children,
  ...props
}: TextShimmerProps) {
  return (
    <span
      className={cn("text-shimmer inline-block", className)}
      style={
        {
          ...style,
          "--text-shimmer-base": baseColor,
          "--text-shimmer-highlight": shimmerColor,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </span>
  );
}
