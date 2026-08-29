import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui-bits";
import { getPublicCycle, submitStep1, verifyEmployeeProfile } from "@/lib/public.functions";
import { APP_NAME, RATING_SCALE } from "@/lib/domain";
import { step1FormSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/evaluation/$cycleToken")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Employee self-assessment — Priority Handling Logistics, Inc." },
      { name: "description", content: "Complete your annual Step 1 performance self-assessment." },
      { property: "og:title", content: "Employee self-assessment" },
      { property: "og:description", content: "Complete your annual Step 1 performance self-assessment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicEvaluationPage,
});

const UNAVAILABLE_COPY: Record<string, { title: string; body: string }> = {
  INVALID: { title: "Link unavailable", body: "This evaluation link is not valid." },
  NOT_STARTED: { title: "Not open yet", body: "This evaluation period has not started." },
  EXPIRED: { title: "Evaluation closed", body: "This evaluation period has ended." },
  CLOSED: { title: "Evaluation closed", body: "This evaluation is no longer accepting responses." },
};

function PublicEvaluationPage() {
  const { cycleToken } = useParams({ from: "/evaluation/$cycleToken" });
  const navigate = useNavigate();
  const fetchCycle = useServerFn(getPublicCycle);
  const submit = useServerFn(submitStep1);
  const verify = useServerFn(verifyEmployeeProfile);

  const submissionId = useMemo(() => crypto.randomUUID(), []);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [signatureMethod, setSignatureMethod] = useState<"UPLOAD" | "DRAWN">("DRAWN");
  const [signatureData, setSignatureData] = useState("");
  const [deviceSessionId] = useState(() => {
    const key = "phl-evaluation-device-session";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [identity, setIdentity] = useState({
    employeeNumber: "",
    firstName: "",
    middleName: "",
    lastName: "",
    jobTitle: "",
    division: "",
    section: "",
  });

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData("");
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#080B3D";
    context.lineTo((event.clientX - rect.left) * (canvas.width / rect.width), (event.clientY - rect.top) * (canvas.height / rect.height));
    context.stroke();
    setSignatureData(canvas.toDataURL("image/png"));
  }

  async function verifyProfile() {
    const missing = [
      ["employeeNumber", "Employee number"],
      ["firstName", "First name"],
      ["lastName", "Last name"],
    ].filter(([key]) => !identity[key as "employeeNumber" | "firstName" | "lastName"].trim());
    if (missing.length > 0) {
      setVerificationMessage(`Enter ${missing.map(([, label]) => label).join(", ")} to verify your profile.`);
      return;
    }
    const identityFields = { employeeNumber: identity.employeeNumber, firstName: identity.firstName, middleName: identity.middleName, lastName: identity.lastName, cycleToken, deviceSessionId };
    setVerifying(true);
    setVerificationMessage("");
    try {
      const result = await verify({ data: identityFields });
      if (result.status === "VERIFIED") {
        setVerified(true);
        setVerificationMessage("Profile verified. You may continue.");
      } else if (result.status === "DUPLICATE") {
        setVerificationMessage("A submission for this employee already exists for this evaluation cycle.");
      } else {
        setVerificationMessage("Profile could not be verified. Please contact the System Administrator.");
      }
    } catch {
      setVerificationMessage("We could not verify those details. Check the required fields and try again.");
    } finally {
      setVerifying(false);
    }
  }
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const query = useQuery({
    queryKey: ["public-cycle", cycleToken],
    queryFn: () => fetchCycle({ data: { cycleToken } }),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <LoadingBlock rows={6} />
      </div>
    );
  }

  const result = query.data;
  if (!result || !result.ok) {
    const copy = UNAVAILABLE_COPY[result?.reason ?? "INVALID"]!;
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
    );
  }

  const cycle = result.cycle;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = step1FormSchema.safeParse({ ...identity, deviceSessionId, ratings, signature: { method: signatureMethod, data: signatureData, contentType: "image/png" } });
    const missing = cycle.criteria.filter((criterion) => !ratings[criterion.id]);
    if (!parsed.success || missing.length > 0) {
      const fieldErrors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          const message = issue.message.trim();
          if (!fieldErrors[key]) fieldErrors[key] = message;
        }
      }
      if (missing.length > 0) fieldErrors["ratings"] = `Rate every factor (${missing.length} remaining)`;
      setErrors(fieldErrors);
      toast.error(
        parsed.success || missing.length === 0
          ? "Please complete every required field"
          : "Please complete all required fields before submitting.",
      );
      return;
    }
    setErrors({});
    if (!verified) {
      setVerificationMessage("Verify your employee profile before submitting.");
      return;
    }
    setPending(true);
    try {
      const response = await submit({
        data: {
          ...parsed.data,
          cycleToken,
          submissionId,
          ratings: cycle.criteria.map((criterion) => ({
            criterionId: criterion.id,
            rating: ratings[criterion.id]!,
          })),
        },
      });
      navigate({ to: "/evaluation-submitted", search: { duplicate: response.status === "DUPLICATE" } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^VALIDATION:\s*/i, "").trim() || "Submission failed, please try again" : "Submission failed, please try again");
    } finally {
      setPending(false);
    }
  }

  const fields: { key: keyof typeof identity; label: string }[] = [
    { key: "employeeNumber", label: "Employee number" },
    { key: "firstName", label: "First name" },
    { key: "middleName", label: "Middle name" },
    { key: "lastName", label: "Last name" },
    { key: "jobTitle", label: "Job title" },
    { key: "division", label: "Division" },
    { key: "section", label: "Section" },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/priority-handling-logo.png"
              alt="Priority Handling Logistics, Inc."
              className="h-8 w-auto max-w-44 object-contain"
            />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{APP_NAME}</p>
              <h1 className="text-sm font-semibold text-foreground">
                {cycle.name} · {cycle.year}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <form className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6" onSubmit={onSubmit}>
        {cycle.instructions ? (
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="pt-6 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {cycle.instructions}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">Your details</CardTitle>
            <CardDescription>Employee number, first name, and last name are required for verification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  value={identity[field.key]}
                  onChange={(event) =>
                    setIdentity((prev) => ({ ...prev, [field.key]: event.target.value.toUpperCase() }))
                  }
                />
                {errors[field.key] ? <p className="text-xs text-destructive">{errors[field.key]}</p> : null}
              </div>
            ))}
            <Button type="button" variant="outline" onClick={verifyProfile} disabled={verifying}>
              {verifying ? "Verifying..." : "Verify employee profile"}
            </Button>
            {verificationMessage ? <p className={cn("text-sm", verified ? "text-emerald-600" : "text-destructive")}>{verificationMessage}</p> : null}
          </CardContent>
        </Card>

        {verified ? <>
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold">Performance factors</CardTitle>
            <CardDescription>Select one rating per factor: 1 (Poor) to 5 (Excellent).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {cycle.criteria.map((criterion) => (
              <fieldset key={criterion.id} className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">
                  {criterion.letter}. {criterion.title}
                </legend>
                <p className="text-xs text-muted-foreground">{criterion.description}</p>
                <div className="grid grid-cols-5 gap-2">
                  {RATING_SCALE.map((scale) => {
                    const selected = ratings[criterion.id] === scale.value;
                    return (
                      <label
                        key={scale.value}
                        className={cn(
                          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-center text-[11px] font-medium transition-all",
                          selected
                            ? "border-primary bg-primary text-primary-foreground font-bold shadow-sm ring-1 ring-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={criterion.id}
                          value={scale.value}
                          checked={selected}
                          onChange={() =>
                            setRatings((prev) => ({ ...prev, [criterion.id]: scale.value }))
                          }
                        />
                        <span className="text-sm font-bold">{scale.value}</span>
                        <span className="leading-tight">{scale.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {errors["ratings"] ? <p className="text-xs text-destructive font-medium">{errors["ratings"]}</p> : null}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm">
          <CardHeader><CardTitle className="text-base font-bold">E-signature</CardTitle><CardDescription>Provide your signature before submitting this assessment.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2"><Button type="button" variant={signatureMethod === "DRAWN" ? "default" : "outline"} onClick={() => { setSignatureMethod("DRAWN"); setSignatureData(""); }}>Draw signature</Button><Button type="button" variant={signatureMethod === "UPLOAD" ? "default" : "outline"} onClick={() => { setSignatureMethod("UPLOAD"); setSignatureData(""); }}>Upload image</Button></div>
            {signatureMethod === "DRAWN" ? <><canvas ref={canvasRef} width={720} height={180} className="h-36 w-full touch-none rounded-md border border-input bg-white" onPointerDown={(event) => { drawingRef.current = true; const context = event.currentTarget.getContext("2d"); const rect = event.currentTarget.getBoundingClientRect(); context?.beginPath(); context?.moveTo((event.clientX - rect.left) * (event.currentTarget.width / rect.width), (event.clientY - rect.top) * (event.currentTarget.height / rect.height)); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={drawSignature} onPointerUp={(event) => { drawingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} /><Button type="button" variant="ghost" onClick={clearSignature}>Clear signature</Button></> : <><Input type="file" accept="image/png,image/jpeg" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 500_000) { setErrors((previous) => ({ ...previous, signature: "Signature image must be 500 KB or smaller" })); return; } const reader = new FileReader(); reader.onload = () => setSignatureData(String(reader.result)); reader.readAsDataURL(file); }} />{signatureData ? <div className="flex h-36 w-full items-center justify-center rounded-md border border-input bg-white p-2"><img src={signatureData} alt="Uploaded electronic signature" className="max-h-full max-w-full object-contain" /></div> : null}</>}
            {errors.signature ? <p className="text-xs text-destructive">{errors.signature}</p> : null}
            {!signatureData ? <p className="text-xs text-muted-foreground">A signature is required.</p> : null}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full text-base font-semibold shadow-md py-6" size="lg" disabled={pending}>
          {pending ? "Submitting…" : "Submit assessment"}
        </Button>
        </> : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Verify your employee profile to begin the assessment.</CardContent></Card>}
      </form>
    </div>
  );
}
