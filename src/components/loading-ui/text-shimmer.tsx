import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TextShimmerProps = HTMLAttributes<HTMLSpanElement> & {
  baseColor?: string;
  shimmerColor?: string;
};

export function TextShimmer({
  className,
  baseColor = "var(--color-primary-foreground)",
  shimmerColor = "var(--color-primary-foreground)",
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
          color: baseColor,
          "--text-shimmer-color": shimmerColor,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </span>
  );
}
