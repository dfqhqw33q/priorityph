import { createFileRoute } from "@tanstack/react-router";
import { Phase2QueuePage } from "@/components/phase2-queue";
export const Route = createFileRoute("/_authenticated/personnel/")({ component: () => <Phase2QueuePage stage="PERSONNEL" /> });
