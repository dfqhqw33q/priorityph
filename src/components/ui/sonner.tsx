import { useTheme } from "@/lib/theme-provider";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={(theme ?? "system") as NonNullable<ToasterProps["theme"]>}
      position="top-right"
      closeButton
      richColors
      expand
      visibleToasts={4}
      duration={6000}
      className="toaster group"
      toastOptions={{
        unstyled: false,
        style: {
          borderRadius: "16px",
          border: "1px solid rgba(148, 163, 184, 0.24)",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
          padding: "12px 14px",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(14px)",
        },
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:border-slate-200/70 group-[.toaster]:bg-white/90 group-[.toaster]:text-slate-900 group-[.toaster]:shadow-[0_20px_45px_rgba(15,23,42,0.16)] dark:group-[.toaster]:border-slate-700 dark:group-[.toaster]:bg-slate-900/90 dark:group-[.toaster]:text-slate-50",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold",
          description: "group-[.toast]:mt-1 group-[.toast]:text-xs group-[.toast]:text-slate-600 dark:group-[.toast]:text-slate-300",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          closeButton:
            "group-[.toast]:border group-[.toast]:border-slate-200 group-[.toast]:bg-white group-[.toast]:text-slate-600 dark:group-[.toast]:border-slate-700 dark:group-[.toast]:bg-slate-800 dark:group-[.toast]:text-slate-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
