import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EvaluationDocumentPreview({
  html,
  open,
  loading,
  onOpenChange,
}: {
  html: string | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Evaluation document</DialogTitle>
          <DialogDescription>Preview or print the completed evaluation document.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-white">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <div className="w-full max-w-2xl space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ) : html ? (
            <iframe
              ref={frameRef}
              title="Evaluation document preview"
              srcDoc={html}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              The document is not available.
            </div>
          )}
        </div>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => frameRef.current?.contentWindow?.print()}
            disabled={!html || loading}
          >
            Print / Export PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
