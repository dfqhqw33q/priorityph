import { useRef } from "react";

import { Button } from "@/components/ui/button";
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
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading document...
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
