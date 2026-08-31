import { createFileRoute } from "@tanstack/react-router";
import { BoothSession } from "@/components/booth/BoothApp";

export const Route = createFileRoute("/booth")({ component: BoothSession });
