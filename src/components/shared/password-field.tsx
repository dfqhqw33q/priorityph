import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validatePassword } from "@/lib/password-policy";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  identifiers = [],
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  identifiers?: string[];
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const result = validatePassword(value, identifiers);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite">
        <div className="flex items-center justify-between">
          <span>Password strength</span>
          <span>
            {value ? ["Weak", "Fair", "Good", "Strong", "Very strong"][result.score] : ""}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${result.score * 25}%` }}
          />
        </div>
        {result.errors.map((error) => (
          <p key={error}>{error}</p>
        ))}
      </div>
    </div>
  );
}
