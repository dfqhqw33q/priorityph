import { createContext, useContext, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beginStepUpAuthentication } from "@/lib/access.functions";
import { markStepUpSatisfied, useSecurityStatus } from "@/hooks/use-access";
import { userErrorMessage } from "@/lib/validation";

type StepUpContextValue = {
  runSensitiveAction: <T>(
    action: string,
    callback: () => Promise<T>,
    critical?: boolean,
  ) => Promise<T | undefined>;
};

const StepUpContext = createContext<StepUpContextValue | null>(null);

type PendingAction = {
  action: string;
  callback: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export function StepUpProvider({ children }: { children: ReactNode }) {
  const security = useSecurityStatus();
  const startStepUp = useServerFn(beginStepUpAuthentication);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function runSensitiveAction<T>(
    action: string,
    callback: () => Promise<T>,
    critical = false,
  ) {
    const elevated = security.elevatedUntil !== null && security.elevatedUntil > Date.now();
    if (!critical && !security.stepUpRequired && elevated) return callback();
    if (!critical && !security.stepUpRequired && !elevated) return callback();
    return new Promise<T | undefined>((resolve, reject) => {
      setPending({ action, callback: callback as () => Promise<unknown>, resolve, reject });
      setPassword("");
      setError(null);
    });
  }

  async function verify() {
    if (!pending || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await startStepUp({ data: { password, action: pending.action } });
      markStepUpSatisfied(result.expiresInSeconds);
      const callback = pending.callback;
      const resolve = pending.resolve;
      setPending(null);
      setPassword("");
      resolve(await callback());
    } catch (verificationError) {
      setError(userErrorMessage(verificationError, "Identity verification failed"));
      pending.reject(verificationError);
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    pending?.reject(new Error("Security verification cancelled"));
    setPending(null);
    setPassword("");
    setError(null);
  }

  return (
    <StepUpContext.Provider value={{ runSensitiveAction }}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && cancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Security verification required</DialogTitle>
            <DialogDescription>
              Verify your identity to continue with {pending?.action ?? "this sensitive action"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="step-up-password">Password</Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verify();
              }}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancel} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void verify()} disabled={submitting || !password}>
              {submitting ? "Verifying..." : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}

export function useStepUp() {
  const context = useContext(StepUpContext);
  if (!context) throw new Error("useStepUp must be used inside StepUpProvider");
  return context;
}
