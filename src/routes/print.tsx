import { createFileRoute } from "@tanstack/react-router";
import { PrintSession } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/print")({ component: PrintSession });
