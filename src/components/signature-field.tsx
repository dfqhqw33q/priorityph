import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SignatureValue = { method: "DRAWN" | "UPLOAD"; data: string };

type Props = { value?: SignatureValue; disabled?: boolean; onChange: (value: SignatureValue | undefined) => void };

export function SignatureField({ value, disabled = false, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || value?.method !== "DRAWN") return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value.data;
  }, [value]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    canvasRef.current?.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    setDrawing(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function end() {
    if (!drawing) return;
    setDrawing(false);
    const data = canvasRef.current?.toDataURL("image/png");
    if (data) onChange({ method: "DRAWN", data });
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(undefined);
  }

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return;
    if (file.size > 500_000) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ method: "UPLOAD", data: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <Label>Electronic signature *</Label>
      <canvas ref={canvasRef} width={640} height={180} aria-label="Draw your signature" className="h-32 w-full touch-none rounded border border-dashed border-border bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled}>Clear</Button>
        <Label htmlFor="signature-upload" className="cursor-pointer rounded-md border border-input px-3 py-2 text-sm">Upload image</Label>
        <Input id="signature-upload" type="file" accept="image/png,image/jpeg" className="hidden" onChange={upload} disabled={disabled} />
        <span className="text-xs text-muted-foreground">PNG or JPEG, up to 500 KB</span>
      </div>
      {value?.method === "UPLOAD" ? <p className="text-xs text-muted-foreground">Uploaded signature selected.</p> : null}
    </div>
  );
}
