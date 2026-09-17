import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/shared/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function ThemeModeControls({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const modes = [
    { value: "light" as const, label: "Light mode", icon: Sun },
    { value: "dark" as const, label: "Dark mode", icon: Moon },
    { value: "system" as const, label: "System theme", icon: Monitor },
  ];

  return (
    <div className={className} role="group" aria-label="Theme">
      {modes.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant={theme === value ? "secondary" : "ghost"}
          size="icon"
          className="size-8"
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}
